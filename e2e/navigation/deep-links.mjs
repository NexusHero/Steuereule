// Deep-link matrix (#450 Teil 4, #443 AC 2 and AC 3): every route of the app, signed in, with
// reload and browser back/forward; and the guest path — an account mask opened without a session
// lands in exactly that mask after signing in.
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'deep-links'
const YEAR = 2026

/** Every path of linking.ts with real parameters. `lands` names a deliberate redirect, with the reason. */
export const ROUTES = [
  { path: '/app' },
  // A completed interview forwards to the next mask and leaves the history, so Back leads to the cockpit.
  { path: `/app/steuerjahr/${YEAR}/interview`, lands: `/app/steuerjahr/${YEAR}/lstb`, reason: 'interview complete → next step' },
  { path: '/app/konto-wand' },
  { path: `/app/steuerjahr/${YEAR}/lstb` },
  { path: `/app/steuerjahr/${YEAR}/rente` },
  { path: `/app/steuerjahr/${YEAR}/schweiz` },
  { path: `/app/steuerjahr/${YEAR}/katalog/lebenslagen` },
  { path: `/app/steuerjahr/${YEAR}/katalog/einkuenfte` },
  { path: `/app/steuerjahr/${YEAR}/katalog/sonderausgaben` },
  { path: `/app/steuerjahr/${YEAR}/arbeitstage` },
  { path: `/app/steuerjahr/${YEAR}/abgabe` },
  { path: `/app/steuerjahr/${YEAR}/plausibilitaet` },
  { path: `/app/steuerjahr/${YEAR}/veranlagungsvergleich` },
  { path: `/app/steuerjahr/${YEAR}/bescheid` },
  { path: `/app/steuerjahr/${YEAR}/kapital` },
  { path: `/app/steuerjahr/${YEAR}/vermietung` },
  { path: `/app/steuerjahr/${YEAR}/kinder` },
  { path: `/app/steuerjahr/${YEAR}/stammdaten` },
  { path: `/app/steuerjahr/${YEAR}/partner/lstb`, lands: `/app/steuerjahr/${YEAR}/stammdaten`, reason: 'ADR-0054: the partner is never in the URL; a deep link opens the partner choice (replace, no back trap)' },
  { path: `/app/steuerjahr/${YEAR}/partner/arbeitsweg`, lands: `/app/steuerjahr/${YEAR}/stammdaten`, reason: 'ADR-0054: the partner is never in the URL; a deep link opens the partner choice (replace, no back trap)' },
  { path: '/app/eule' },
  { path: '/app/belege' },
  { path: '/app/profil' },
  { path: '/app/profil/datenschutz' },
  { path: '/app/profil/sicherheit' },
  { path: '/app/profil/stammdaten' },
  { path: `/app/steuerjahr/${YEAR}/ausdruck`, lands: `/app/steuerjahr/${YEAR}/abgabe`, reason: 'AC 6: open blockers lock the printout and lead to the gate' },
  { path: `/app/steuerjahr/${YEAR}/bestaetigung` },
  { path: '/rechtliches/impressum' },
  { path: '/rechtliches/datenschutz' },
]

/** Masks a guest opens without a session; after signing in they must land exactly there (AC 3). */
const GUEST_TARGETS = [`/app/steuerjahr/${YEAR}/lstb`, `/app/steuerjahr/${YEAR}/kinder`, '/app/profil/sicherheit']

const ERROR_COPY = 'Das hat nicht geklappt.'
const KONTO_WAND_LOGIN = 'Ich hab schon ein Konto'

async function account(apiOrigin, webOrigin, sql) {
  const email = `deeplinks-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`sign-in failed (${res.status()})`)
  return { email, api }
}

async function call(api, method, path, data) {
  const res = await api.fetch(path, { method, ...(data === undefined ? {} : { data }) })
  if (!res.ok()) fail(`${method} ${path} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function login(page, email) {
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, PASSWORD)
}

const pathOf = (page) => new URL(page.url()).pathname.replace(/\/$/, '') || '/'

/** Waits until the URL settles (the app may replace it once while it resolves the route). */
async function settledPath(page) {
  let last = pathOf(page)
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(250)
    const now = pathOf(page)
    if (now === last && i >= 2) break
    last = now
  }
  return last
}

const problems = []

/**
 * better-auth's limiter is a rolling window (rate-limit-storage.ts): the count only resets after a
 * gap of more than 10 s without a call, and every full page load reads the session. So: after at
 * most 60 reads, wait for a quiet gap.
 */
let readsSinceGap = 0
let lastRead = 0
function countSessionReads(page) {
  page.on('request', (req) => {
    if (!req.url().includes('/api/auth/get-session')) return
    const now = Date.now()
    readsSinceGap = now - lastRead > 10_000 ? 1 : readsSinceGap + 1
    lastRead = now
  })
}
async function paceSessionReads() {
  if (readsSinceGap < 60) return
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 10_750 - (Date.now() - lastRead))))
  readsSinceGap = 0
}

async function expectScreen(page, route, step) {
  const expected = route.lands ?? route.path
  const path = await settledPath(page)
  if (path !== expected) problems.push(`${route.path} (${step}): expected ${expected}, landed on ${path}`)
  if ((await page.getByText(ERROR_COPY).count()) > 0) problems.push(`${route.path} (${step}): the screen shows an error state`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    // A married couple, so the partner masks and the comparison have a reason to exist.
    const user = await account(apiOrigin, webOrigin, sql)
    for (const [questionId, value] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet']]) {
      await call(user.api, 'POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId, value })
    }
    await call(user.api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    countSessionReads(page)
    await skipSplash(page, webOrigin)
    await login(page, user.email)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })

    for (const route of ROUTES) {
      await paceSessionReads()
      // Direct load, then reload: the same mask in the same tax year (AC 2).
      await page.goto(`${webOrigin}${route.path}`, { waitUntil: 'networkidle' })
      await expectScreen(page, route, 'load')
      await page.reload({ waitUntil: 'networkidle' })
      await expectScreen(page, route, 'reload')
      // Back to the cockpit and forward again (not for the cockpit itself).
      if (route.path === '/app') {
        console.log(`[${TAG}] ✅ ${route.path}`)
        continue
      }
      await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await page.goto(`${webOrigin}${route.path}`, { waitUntil: 'networkidle' })
      await page.goBack({ waitUntil: 'networkidle' })
      const back = await settledPath(page)
      if (back !== '/app') problems.push(`${route.path}: browser back must return to /app, got ${back}`)
      await page.goForward({ waitUntil: 'networkidle' })
      await expectScreen(page, route, 'forward')
      console.log(`[${TAG}] ✅ ${route.path}${route.lands ? ` → ${route.lands} (${route.reason})` : ''}`)
    }
    await ctx.close()
    if (problems.length > 0) fail(`Deep-link matrix:\n  ${problems.join('\n  ')}`)

    // AC 3 — without a session the mask URL leads to the sign-in and, after it, exactly back.
    for (const target of GUEST_TARGETS) {
      const guestCtx = await newContextAtBreakpoint(browser, 'l')
      const guest = await guestCtx.newPage()
      guardAgainst429(guest, fail, '/api/auth/')
      await guest.goto(`${webOrigin}${target}`, { waitUntil: 'networkidle' })
      // Without a session the mask URL leads to the Konto-Wand; its sign-in link leads to the login.
      await guest.waitForURL((u) => u.pathname === '/app/konto-wand', { timeout: 15_000 })
      await guest.getByRole('button', { name: KONTO_WAND_LOGIN }).click()
      await guest.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).waitFor({ state: 'visible', timeout: 15_000 })
      await login(guest, user.email)
      await guest.waitForURL((u) => u.pathname === target, { timeout: 15_000 }).catch(async () => fail(`AC 3: after sign-in expected ${target}, got ${pathOf(guest)}`))
      console.log(`[${TAG}] ✅ AC 3 — ${target} without a session → sign-in → back to ${target}`)
      await guestCtx.close()
    }

    await user.api.dispose()
    console.log(`[${TAG}] PASS — ${ROUTES.length} routes with load, reload, back and forward; ${GUEST_TARGETS.length} guest deep links.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
