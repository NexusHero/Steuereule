// Banner DS-QA gate — the verify-banner's computed styles at 375/768/1280 (#223, promoting the
// scratch `ds-qa-215.mjs` pass into CI).
//
// A closer cousin of `breakpoint-layout.mjs`'s computed-style-sampling pattern than of
// `visibility/visibility-refetch.mjs`'s behavioural probe (Musti's #223 review): this asserts
// the unverified banner's rendered colours/box metrics match the DS's `warn` semantic token
// pair (`@steuereule/tokens` `theme.light.color.warn`/`warnWeich`, `farben-semantik.html`) on
// both RegistrierungScreen and LoginScreen — a visual/token regression here means the banner's
// colours or spacing drifted, a different failure mode from the refetch mechanism breaking (the
// reason this lives in its own file with its own exit code rather than sharing one with
// `visibility-refetch.mjs`).
//
// Deliberately does not touch Postgres directly and does not need `DATABASE_URL`/`API_ORIGIN` —
// both screens' unverified banner is reached purely by driving the real UI (a real sign-up
// through RegistrierungScreen, then a real sign-in with that same account through LoginScreen in
// a fresh browser context). Only the LIGHT theme is checked — `App.tsx` hardcodes
// `ThemeProvider mode="light"` with no reachable switch, so a dark-theme check would have to
// instantiate `ThemeProvider mode="dark"` itself, which is a component test on the wrong side of
// this harness (Musti's #223 ruling, tracked separately as #226 — deliberately out of scope
// here).
//
// SHARED-RATE-LIMIT BUCKET (found running this in CI, first #223 attempt, ef5930c; corrected
// after Musti's #223 review, F5). better-auth's built-in special-path rule for `/sign-up*`/
// `/sign-in*` is window=10s/max=3 (apps/api/src/auth/better-auth.ts:169-187) — a real,
// load-bearing REQ-010 control, never loosened for CI. In THIS job specifically, the API logs
// "Rate limiting could not determine a client IP and is falling back to a single shared per-path
// bucket" — every script's sign-up calls in this job share ONE bucket, and every script's sign-in
// calls share a separate one (`e2e/visibility/visibility-refetch.mjs`'s header documents the
// identical mechanics — keep the two descriptions in sync if either changes).
//
// **The bucket is a ROLLING window keyed on `lastRequest`, not a per-job quota.** `count` resets
// after any gap longer than 10s on that path; `lastRequest` advances on every allowed call. Three
// calls nine seconds apart still exhaust it; the same three calls with a >10s gap never touch it.
// So the guidance for whoever adds a fourth step here is NOT "how many calls are left" — it's
// "never drive more than 3 sign-up/sign-in calls on the same path without a >10s quiet period
// somewhere in the sequence". `breakpoint-layout.mjs`'s own three sign-ups (one per breakpoint)
// stay safe today because its CockpitScreen flows between them take real time — a gap, not a
// remaining-count.
//
// The original version of this script created one fresh account per breakpoint (3 sign-ups + 3
// sign-ins) landing immediately after `breakpoint-layout.mjs`'s own 3 sign-ups with no gap between
// scripts — that clustering, not a quota being "used up", is what tripped the job on `bp=l`. Fixed
// by using exactly ONE account for the whole file: one real sign-up (RegistrierungScreen) and one
// real sign-in with that same account (LoginScreen), sweeping all three breakpoints on the SAME
// already-mounted page via `page.setViewportSize`. This departs from the *closer* precedent in
// `breakpoint-layout.mjs`, worth naming rather than glossing: that file uses resize for its own
// `assertMaxWidthAtViewport` (a read-only layout measurement), but a **fresh context per width**
// for `measureRegistrierungSuccess` (`breakpoint-layout.mjs:298`) — exactly the flow that costs an
// auth call. This file does the opposite trade for that flow, on purpose: `verifyBanner`'s style
// is built by `makeStyles(t)` off theme alone, no `bp`/width input
// (`RegistrierungScreen.tsx:220-228`, `LoginScreen.tsx:243`), so re-authenticating per width would
// spend three sign-ups/sign-ins to re-assert byte-identical `EXPECTED` values three times. Account
// reuse costs nothing here; a fresh context per width would have cost three real auth calls for no
// additional coverage on the axis that varies (see the coverage note on `measureBanner`, below).
//
// If a REQ-010 CI-only carve-out is ever wanted for the rate limiter itself, that is a call for
// Suhay/the stakeholder to make explicitly — this script does not take it unilaterally, and does
// not delete or otherwise weaken the `RateLimit` table.
//
// Locator note: neither banner nor its heading carries a `testID` on either screen — both use
// `accessibilityRole="alert"` only (confirmed directly against RegistrierungScreen.tsx /
// LoginScreen.tsx). Selectors below are role + the resolved i18n copy, never a `data-testid`.
//
// Exits non-zero on the first failed assertion (or an immediate 429 from any `/api/auth/*`
// response — see `guardAgainst429`, Musti's #223 review F7: a 429 must be the reported cause, not
// a heading-timeout ten seconds later with the real reason three log files away) — merge gate,
// not a report.

import { chromium } from 'playwright-core'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')

const BREAKPOINTS = [
  { name: 's', width: 375, height: 812 },
  { name: 'm', width: 768, height: 1024 },
  { name: 'l', width: 1280, height: 900 },
]

// Must match @steuereule/tokens dist/theme.ts's `light.color` block (App.tsx hardcodes
// `mode="light"`, so this is the only theme any real user reaches today).
const EXPECTED = {
  background: hexToRgb('#ffeecf'), // warnWeich
  border: hexToRgb('#e07b00'), // warn
  borderWidth: '2px', // t.space.kontur
  borderRadius: '12px', // t.radius.s
  padding: '16px', // t.space.s4
}

const COPY = {
  splashSkip: 'Weiter zur App',
  register: 'Neu hier? Konto anlegen',
  registrierungEmailPlaceholder: 'du@beispiel.de',
  registrierungPasswordPlaceholder: 'Mindestens 6 Zeichen',
  registrierungSubmit: 'Konto anlegen',
  registrierungSuccessHeading: 'Willkommen bei SteuerEule.',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  verifyHeading: 'Bitte bestätige noch deine E-Mail.',
}

const PASSWORD = 'Sicheres-Passwort-1!'

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

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`not a #rrggbb hex colour: ${hex}`)
  const [, r, g, b] = match
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`
}

/**
 * Fails loudly and immediately on a 429 from any auth path, instead of letting the caller's own
 * subsequent `waitFor` surface it ten seconds later as an unexplained heading timeout (Musti's
 * #223 review, F7 — a comment alone is not sufficient). This script has no DB access (see the
 * header comment) so it can't proactively check the bucket the way `visibility-refetch.mjs`
 * does; this is its equivalent safety net.
 */
function guardAgainst429(page) {
  page.on('response', (response) => {
    if (response.status() === 429 && response.url().includes('/api/auth/')) {
      fail(
        `${response.url()} returned 429 — the shared per-path rate-limit bucket (see this file's ` +
          `header comment) was exhausted.`,
      )
    }
  })
}

async function skipSplash(page) {
  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

/**
 * Asserts the verify-banner's computed style against `EXPECTED` and checks for horizontal
 * overflow at the page's current viewport. Coverage note (Musti's #223 review, F6): `EXPECTED`
 * is width-independent by construction (see the header comment) — the token/colour/box-metric
 * assertion is genuinely proven once, at whichever breakpoint runs first, and the m/l passes
 * re-assert the identical values rather than adding independent token coverage at those widths.
 * The overflow check is the one assertion in this function that is actually width-sensitive, and
 * it does run fresh at all three.
 */
async function measureBanner(page, label) {
  const banner = page.getByRole('alert')
  await banner.waitFor({ state: 'visible', timeout: 5_000 })
  const style = await banner.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      background: cs.backgroundColor,
      border: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      borderRadius: cs.borderTopLeftRadius,
      padding: cs.paddingTop,
    }
  })

  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (style[key] !== expected) {
      fail(
        `${label}: verify-banner ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(style[key])} — ` +
          `the DS's warn semantic token pair is not being honoured.`,
      )
    }
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  if (hasHorizontalOverflow) {
    fail(`${label}: horizontal overflow detected with the verify-banner rendered.`)
  }

  console.log(`[banner-ds-qa] ✅ ${label} — verify-banner matches the warn token pair, no overflow`)
}

/**
 * Sweeps all three breakpoints on the SAME already-mounted page — no new navigation, no new
 * account, exactly like `breakpoint-layout.mjs`'s `assertMaxWidthAtViewport` — so the whole file
 * spends exactly one auth call per screen, not one per breakpoint (see the shared-rate-limit
 * header comment above for why that matters in this job). What this sweep proves per screen:
 * horizontal-overflow-free rendering at all three widths, and the `EXPECTED` token/box-metric
 * assertion once (the values are width-independent by construction — see `measureBanner`'s own
 * comment).
 */
async function measureBannerAcrossBreakpoints(page, screenLabel) {
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    // Allow React-Native-Web's useWindowDimensions to re-render after resize (same guard
    // `breakpoint-layout.mjs` uses).
    await page.waitForTimeout(300)
    await measureBanner(page, `${screenLabel} (bp=${bp.name})`)
  }
}

async function checkRegistrierung(browser, email) {
  const context = await browser.newContext({ viewport: { width: BREAKPOINTS[0].width, height: BREAKPOINTS[0].height } })
  try {
    const page = await context.newPage()
    guardAgainst429(page)
    await skipSplash(page)
    await page.getByText(COPY.register, { exact: true }).click()
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill(PASSWORD)
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()
    await page.getByText(COPY.registrierungSuccessHeading).waitFor({ state: 'visible', timeout: 10_000 })
    await measureBannerAcrossBreakpoints(page, 'RegistrierungScreen')
  } finally {
    await context.close()
  }
}

async function checkLogin(browser, email) {
  // Fresh context (no cookies) — the same account signing in again, a real returning-user flow,
  // through LoginScreen's own form. One sign-in call for the whole file, not one per breakpoint.
  const context = await browser.newContext({ viewport: { width: BREAKPOINTS[0].width, height: BREAKPOINTS[0].height } })
  try {
    const page = await context.newPage()
    guardAgainst429(page)
    await skipSplash(page)
    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(PASSWORD)
    await page.getByRole('button', { name: COPY.loginSubmit }).click()
    await page.getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 10_000 })
    await measureBannerAcrossBreakpoints(page, 'LoginScreen')
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    // One account for the whole file (see the shared-rate-limit-bucket header comment) — a real
    // sign-up, then a real sign-in with that same account, each swept across all three
    // breakpoints on its own already-mounted page rather than re-authenticated per width.
    const email = `banner-ds-qa-${Date.now()}@beispiel.de`
    await checkRegistrierung(browser, email)
    await checkLogin(browser, email)
    console.log('[banner-ds-qa] PASS — verify-banner DS fidelity holds on both screens, all breakpoints.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[banner-ds-qa] FAIL —', error?.message ?? error)
  process.exit(1)
})
