// Accessibility in both themes and keyboard use of the sheets (#450 Teil 4).
//   Row A — axe (WCAG 2.1 A/AA, same rule set as bfsg-wcag-audit.mjs) on every main screen and two
//           sheets, once with prefers-color-scheme light and once dark (profile on „System“).
//   Row B — keyboard only through a sheet: Tab keeps the focus inside, Escape closes it.
import AxeBuilder from '@axe-core/playwright'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'a11y-themes'
const YEAR = 2026
// Same exceptions as bfsg-wcag-audit.mjs: RN-Web has no <main> landmark; contrast is tested on the
// design tokens in @steuereule/ui for both themes.
const BODY_BACKGROUND = { light: 'rgb(244, 242, 233)', dark: 'rgb(18, 20, 12)' }
const DISABLED_RULES = ['landmark-one-main', 'page-has-heading-one', 'region', 'color-contrast']

const SCREENS = [
  { name: 'Cockpit', path: '/app' },
  { name: 'LStB (Sheet)', path: `/app/steuerjahr/${YEAR}/lstb` },
  { name: 'Arbeitstage (Sheet)', path: `/app/steuerjahr/${YEAR}/arbeitstage` },
  { name: 'Katalog Sonderausgaben', path: `/app/steuerjahr/${YEAR}/katalog/sonderausgaben` },
  { name: 'Stammdaten', path: `/app/steuerjahr/${YEAR}/stammdaten` },
  { name: 'Abgabe', path: `/app/steuerjahr/${YEAR}/abgabe` },
  { name: 'Kinder', path: `/app/steuerjahr/${YEAR}/kinder` },
  { name: 'Eule', path: '/app/eule' },
  { name: 'Belege', path: '/app/belege' },
  { name: 'Profil', path: '/app/profil' },
  { name: 'Sicherheit', path: '/app/profil/sicherheit' },
  { name: 'Datenschutz', path: '/app/profil/datenschutz' },
  { name: 'Impressum', path: '/rechtliches/impressum' },
]

async function account(apiOrigin, webOrigin, sql) {
  const email = `a11y-themes-${Date.now()}@beispiel.de`
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

async function signIn(browser, webOrigin, email, colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme })
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, PASSWORD)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
  return { ctx, page }
}

async function axe(page, label) {
  await page.waitForTimeout(300)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(DISABLED_RULES).analyze()
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${label}: [${v.impact}] ${v.id} — ${v.help} ${v.nodes.slice(0, 2).map((n) => JSON.stringify(n.target)).join(' ')}`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await account(apiOrigin, webOrigin, sql)

    // Row A — axe in both themes.
    const problems = []
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await signIn(browser, webOrigin, user.email, scheme)
      for (const screen of SCREENS) {
        await page.goto(`${webOrigin}${screen.path}`, { waitUntil: 'networkidle' })
        await page.locator('[data-testid="screen-container"], [role="tablist"]').first().waitFor({ state: 'visible', timeout: 15_000 })
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        if (background !== BODY_BACKGROUND[scheme]) problems.push(`${screen.name} (${scheme}): body background ${background}, expected the ${scheme} theme`)
        problems.push(...(await axe(page, `${screen.name} (${scheme})`)))
      }
      await ctx.close()
      console.log(`[${TAG}] ${scheme}: ${SCREENS.length} screens audited`)
    }
    if (problems.length > 0) fail(`Row A — WCAG 2.1 AA violations:\n  ${problems.join('\n  ')}`)
    console.log(`[${TAG}] ✅ Row A — ${SCREENS.length} screens × light/dark without critical or serious violations`)

    // Row B — keyboard only through the LStB sheet.
    const { ctx, page } = await signIn(browser, webOrigin, user.email, 'light')
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    const dialog = page.locator('[role="dialog"]').first()
    await dialog.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').focus()
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab')
      const inside = await dialog.evaluate((el) => el.contains(document.activeElement))
      if (!inside) fail(`Row B: after ${i + 1} Tab presses the focus left the sheet (${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))})`)
    }
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 10_000 })
    console.log(`[${TAG}] ✅ Row B — 40 Tab/Shift+Tab presses stay in the sheet; Escape closes it`)
    await ctx.close()

    await user.api.dispose()
    console.log(`[${TAG}] PASS — accessibility in both themes and keyboard use of the sheets verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
