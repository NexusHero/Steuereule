// Visibility-refetch regression gate (#223, promoting #215/#217's manual proof into CI).
//
// REQ-005's "shown honestly" clause (register.md) requires the unverified/verified banner to
// be a LIVE read, never a value snapshotted at sign-up/sign-in and left stale. #194/#215 fixed
// this on RegistrierungScreen, #217/#225 on LoginScreen; both now go through the shared
// `useEmailVerified(email)` hook (apps/mobile-web/src/auth/useEmailVerified.ts). This script is
// the standing regression guard for that shared seam, on both screens, against the real
// exported bundle + real API + real Postgres, cross-origin — no mocks.
//
// The mechanism under test: better-auth's session atom re-fetches on tab focus
// (`refetchOnWindowFocus`, auth-client.ts:26). A `visibilitychange` dispatch on the
// still-mounted document is the same trigger a real "return from the mail client" produces —
// NOT a reload/navigation, which would lose the screen's local `stage` state and drop the user
// straight past the banner entirely (see RegistrierungScreen.tsx/LoginScreen.tsx's own
// `Stage.success`/`Stage.unverified` comments).
//
// Per-screen assertion shape (Musti's #223 ruling — the substantive addition over the
// #215/#225 manual runs this promotes):
//   1. Real sign-up/sign-in → assert the UNVERIFIED banner.
//   2. Dispatch visibilitychange BEFORE the DB flip, and assert the banner does NOT flip. A
//      single break/restore of `refetchOnWindowFocus` (proven separately, see the PR's evidence
//      block) only proves "the banner never updates" — it says nothing about
//      `useEmailVerified`'s two real rules (fail-closed: only `emailVerified === true` counts;
//      account-scoped: only a session for THIS email counts). A permissive mutant of either
//      rule leaves a break/restore-only gate green. This step is what catches that class
//      (#227's fifteenth instance).
//   3. Flip `emailVerified` in the real DB, dispatch visibilitychange again, and assert the
//      VERIFIED banner appears within a bounded timeout.
//
// Assumes the caller has already booted the same stack as `e2e/cross-origin/run.mjs` /
// `e2e/responsive/breakpoint-layout.mjs` (real Postgres, the compiled API, the exported web
// bundle statically served) — same job, see `.github/workflows/ci.yml`'s `Browser gates` job.
//
// Locator note (Musti's #223 review): neither banner nor its heading carries a `testID` on
// either screen (checked directly against RegistrierungScreen.tsx/LoginScreen.tsx) — both use
// `accessibilityRole="alert"` only. Selectors below are role + the resolved i18n copy
// (`COPY`, lifted from apps/mobile-web/src/i18n/resources.ts — same pattern
// `e2e/responsive/breakpoint-layout.mjs` already establishes), never a `data-testid`. That is a
// deliberate stop-rule, not an oversight — see the PR description.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')
const API_ORIGIN = requireEnv('API_ORIGIN')
const DATABASE_URL = requireEnv('DATABASE_URL')

// German copy (app boots in `de`, ADR-0006), lifted straight from
// apps/mobile-web/src/i18n/resources.ts. Shared between RegistrierungScreen and LoginScreen
// via `auth.verifyBanner`/`auth.verifiedBanner` (both screens read the same keys).
const COPY = {
  splashSkip: 'Weiter zur App',
  register: 'Neu hier? Konto anlegen',
  registrierungEmailPlaceholder: 'du@beispiel.de',
  registrierungPasswordPlaceholder: 'Mindestens 6 Zeichen',
  registrierungSubmit: 'Konto anlegen',
  registrierungSuccessHeading: 'Willkommen bei SteuerEule.',
  loginSubmit: 'Einloggen',
  verifyHeading: 'Bitte bestätige noch deine E-Mail.',
  verifiedHeading: 'E-Mail bestätigt ✓',
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`::error::${name} is required.`)
    process.exit(1)
  }
  return value
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

// Direct SQL against the real Postgres the job already migrated — there is no mail client in
// this environment (#223's parent ticket, #224, records why that stays a permanently-manual
// iOS check), so verification is driven out-of-band the same way #215/#225's manual runs did.
function sql(query) {
  const url = new URL(DATABASE_URL)
  const host = url.hostname
  const port = url.port || '5432'
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = url.pathname.slice(1)
  return execSync(
    `psql -h ${host} -p ${port} -U ${user} -d ${database} -t -A -c "${query.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password } },
  ).trim()
}

async function signUpOutOfBand(email, password) {
  const res = await fetch(`${API_ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
}

/**
 * The real "return from the mail client" trigger, without a mail client: a hidden→visible
 * `visibilitychange` pair on the still-mounted document (no reload/navigation — see the header
 * comment for why a reload can't exercise this code path at all).
 */
async function dispatchVisibilityChange(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(50)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/**
 * Step 2 of the per-screen shape: dispatch while the DB row is still unverified, and assert the
 * banner does NOT flip. Waits the same bound the positive assertion waits (so a hypothetical
 * slow-but-eventually-wrong flip would still be caught), then asserts both directions: the
 * unverified banner is still there, and the verified banner has not appeared.
 */
async function assertBannerDoesNotFlip(page) {
  const dispatchedAt = Date.now()
  await dispatchVisibilityChange(page)
  await page.waitForTimeout(1_500)
  const stillUnverified = await page.getByRole('alert').getByText(COPY.verifyHeading).isVisible().catch(() => false)
  const verifiedAppeared = await page.getByRole('alert').getByText(COPY.verifiedHeading).count()
  if (!stillUnverified || verifiedAppeared > 0) {
    fail(
      'Banner flipped to verified on a visibilitychange dispatch while emailVerified was still ' +
        'false in the DB — useEmailVerified\'s fail-closed rule is not holding.',
    )
  }
  return dispatchedAt
}

async function assertBannerFlipsAfterDbVerify(page, email) {
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  await dispatchVisibilityChange(page)
  await page.getByRole('alert').getByText(COPY.verifiedHeading).waitFor({ state: 'visible', timeout: 5_000 })
}

// FINDING, not fixed at the source (better-auth's own client, not this repo's code): every
// visibilitychange-triggered refetch is itself rate-limited client-side to once per
// FOCUS_REFETCH_RATE_LIMIT_SECONDS=5 (better-auth/dist/client/session-refresh.mjs) — a *second*
// visibilitychange dispatch inside that window is silently swallowed (`fetchSession` is never
// called), which is indistinguishable from the app doing nothing. The negative-then-positive
// shape this ticket requires dispatches twice in quick succession, so without this wait the
// *positive* assertion times out for a reason that has nothing to do with `useEmailVerified` —
// discovered running this very script against the real stack while wiring it into CI. Waiting
// out the real throttle here is also the honest thing to do: a real user's mail-app round trip
// is never sub-5-seconds anyway.
async function waitOutFocusRefetchRateLimit(sinceMs) {
  const elapsed = Date.now() - sinceMs
  const remaining = 5_500 - elapsed
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
}

async function skipSplash(page) {
  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
  // Guarded the same way breakpoint-layout.mjs's skipSplash is: SplashScreen's own
  // AUTO_ADVANCE_MS may have already fired by the time `networkidle` resolves, in which case
  // the skip button is already gone.
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

async function testRegistrierungScreen(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  try {
    const page = await context.newPage()
    const email = `visibility-refetch-registrierung-${Date.now()}@beispiel.de`

    await skipSplash(page)
    await page.getByText(COPY.register, { exact: true }).click()
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill('Sicheres-Passwort-1!')
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()
    await page.getByText(COPY.registrierungSuccessHeading).waitFor({ state: 'visible', timeout: 10_000 })

    await page.getByRole('alert').getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 5_000 })
    console.log('[visibility-refetch] RegistrierungScreen: unverified banner shown after real sign-up')

    const negativeDispatchAt = await assertBannerDoesNotFlip(page)
    console.log('[visibility-refetch] RegistrierungScreen: banner did NOT flip on dispatch while still unverified')

    await waitOutFocusRefetchRateLimit(negativeDispatchAt)
    await assertBannerFlipsAfterDbVerify(page, email)
    console.log('[visibility-refetch] RegistrierungScreen: banner flipped to verified after DB flip + dispatch')
  } finally {
    await context.close()
  }
}

async function testLoginScreen(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  try {
    const page = await context.newPage()
    const email = `visibility-refetch-login-${Date.now()}@beispiel.de`
    const password = 'Sicheres-Passwort-1!'

    // The account is created out-of-band (a direct POST, its own cookie jar never touching the
    // browser context) so the browser reaches LoginScreen's `unverified` stage through a real
    // sign-in click, not a fabricated stage — this screen's own sign-up flow is
    // RegistrierungScreen's job to cover, not this one's.
    await signUpOutOfBand(email, password)

    await skipSplash(page)
    await page.getByPlaceholder('du@beispiel.de').fill(email)
    await page.getByPlaceholder('••••••••').fill(password)
    await page.getByRole('button', { name: COPY.loginSubmit }).click()

    await page.getByRole('alert').getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 10_000 })
    console.log('[visibility-refetch] LoginScreen: unverified banner shown after real sign-in')

    const negativeDispatchAt = await assertBannerDoesNotFlip(page)
    console.log('[visibility-refetch] LoginScreen: banner did NOT flip on dispatch while still unverified')

    await waitOutFocusRefetchRateLimit(negativeDispatchAt)
    await assertBannerFlipsAfterDbVerify(page, email)
    console.log('[visibility-refetch] LoginScreen: banner flipped to verified after DB flip + dispatch')
  } finally {
    await context.close()
  }
}

async function main() {
  // Rate-limited per client-IP bucket (better-auth + RateLimit table, ADR-0012 §5) — this
  // script drives several sign-ups/sign-ins in a row from the same loopback IP, so clear the
  // bucket up front rather than fight it (same reasoning as the scratch runs this promotes).
  sql(`DELETE FROM "RateLimit"`)

  const browser = await chromium.launch({ headless: true })
  try {
    await testRegistrierungScreen(browser)
    sql(`DELETE FROM "RateLimit"`)
    await testLoginScreen(browser)
    console.log('[visibility-refetch] PASS — both screens re-read verification live, both directions.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[visibility-refetch] FAIL —', error?.message ?? error)
  process.exit(1)
})
