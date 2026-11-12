// Visual regression (#450 Teil 4): every main screen at 375 px and 1280 px, light and dark, compared
// pixel by pixel with the baselines in e2e/visual/baselines/<platform>/.
//
//   VISUAL_UPDATE=1  writes new baselines instead of comparing (after an intended change).
//   VISUAL_OUT=<dir> writes the current screenshots and the diff images there (CI artifact).
//
// Baselines are per platform: fonts render differently on macOS and Linux, and CI runs on Linux.
// A platform without baselines records them into VISUAL_OUT and passes with a notice, so the first
// CI run produces the Linux set to commit.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'visual'
const YEAR = 2026
const here = path.dirname(fileURLToPath(import.meta.url))
const BASELINES = path.join(here, 'baselines', process.platform)
const OUT = process.env.VISUAL_OUT ? path.resolve(process.env.VISUAL_OUT) : null
const UPDATE = process.env.VISUAL_UPDATE === '1'
/** Share of differing pixels that still counts as equal (anti-aliasing noise). */
const MAX_DIFF_RATIO = 0.002

const WIDTHS = { s: 375, l: 1280 }
const SCREENS = [
  { name: 'cockpit', path: '/app' },
  { name: 'lstb', path: `/app/steuerjahr/${YEAR}/lstb` },
  { name: 'arbeitstage', path: `/app/steuerjahr/${YEAR}/arbeitstage` },
  { name: 'stammdaten', path: `/app/steuerjahr/${YEAR}/stammdaten` },
  { name: 'abgabe', path: `/app/steuerjahr/${YEAR}/abgabe` },
  { name: 'eule', path: '/app/eule' },
  { name: 'belege', path: '/app/belege' },
  { name: 'profil', path: '/app/profil' },
  { name: 'impressum', path: '/rechtliches/impressum' },
]
/** Content that changes from run to run (e-mail, today's deadline text, version strings, the date an untitled conversation is listed under). */
const MASKS = ['[data-testid="eule-conversation-row"]', '[data-testid^="fristen-banner"]', '[data-testid="profil-email"]', '[data-testid="profil-name"]', '[data-testid="app-version"]']
const FREEZE_CSS = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'

async function account(apiOrigin, webOrigin, sql) {
  const email = `visual-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`sign-in failed (${res.status()})`)
  for (const [questionId, value] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']]) {
    const r = await api.post(`/v1/steuerjahre/${YEAR}/interview/antworten`, { data: { questionId, value } })
    if (!r.ok()) fail(`interview ${questionId} answered ${r.status()}`)
  }
  return { email, api }
}

function compare(name, current) {
  const file = path.join(BASELINES, `${name}.png`)
  if (OUT) writeFileSync(path.join(OUT, `${name}.png`), current)
  if (UPDATE || !existsSync(file)) {
    if (UPDATE) {
      mkdirSync(BASELINES, { recursive: true })
      writeFileSync(file, current)
    }
    return { name, kind: 'recorded' }
  }
  const a = PNG.sync.read(readFileSync(file))
  const b = PNG.sync.read(current)
  if (a.width !== b.width || a.height !== b.height) return { name, kind: 'size', detail: `${a.width}×${a.height} → ${b.width}×${b.height}` }
  const diff = new PNG({ width: a.width, height: a.height })
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 })
  const ratio = pixels / (a.width * a.height)
  if (ratio > MAX_DIFF_RATIO) {
    if (OUT) writeFileSync(path.join(OUT, `${name}.diff.png`), PNG.sync.write(diff))
    return { name, kind: 'diff', detail: `${(ratio * 100).toFixed(2)} % of the pixels differ` }
  }
  return { name, kind: 'equal' }
}

async function main() {
  if (OUT) mkdirSync(OUT, { recursive: true })
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await account(apiOrigin, webOrigin, sql)
    const results = []
    for (const [size, width] of Object.entries(WIDTHS)) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: 'reduce' })
        const page = await ctx.newPage()
        guardAgainst429(page, fail, '/api/auth/')
        await skipSplash(page, webOrigin)
        await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
        await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(user.email)
        await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
        await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
        await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
        for (const screen of SCREENS) {
          await page.goto(`${webOrigin}${screen.path}`, { waitUntil: 'networkidle' })
          await page.addStyleTag({ content: FREEZE_CSS })
          await page.evaluate(() => document.fonts.ready)
          await page.waitForTimeout(400)
          const shot = await page.screenshot({ fullPage: false, mask: MASKS.map((m) => page.locator(m)), maskColor: '#888888' })
          results.push(compare(`${screen.name}-${size}-${scheme}`, shot))
        }
        await ctx.close()
      }
    }
    const recorded = results.filter((r) => r.kind === 'recorded')
    const failed = results.filter((r) => r.kind === 'diff' || r.kind === 'size')
    for (const r of results) console.log(`[${TAG}] ${r.kind === 'equal' ? '✅' : r.kind === 'recorded' ? '📸' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    if (failed.length > 0) fail(`${failed.length} screenshots differ from the baseline (${BASELINES}); see ${OUT ?? 'VISUAL_OUT'} for the diff images. After an intended change run with VISUAL_UPDATE=1.`)
    if (recorded.length > 0 && !UPDATE) {
      console.log(`::notice::${recorded.length} screenshots have no baseline for ${process.platform} yet. They are in ${OUT ?? '(set VISUAL_OUT)'}; commit them to ${BASELINES}.`)
    }
    await user.api.dispose()
    console.log(`[${TAG}] PASS — ${results.length} screenshots (${SCREENS.length} screens × 375/1280 px × light/dark): ${results.length - recorded.length} compared, ${recorded.length} recorded.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
