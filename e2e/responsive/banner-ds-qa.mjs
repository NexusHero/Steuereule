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
// Both screens' unverified banner is reached purely by driving the real UI (a real sign-up
// through RegistrierungScreen, then a real sign-in with that same account through LoginScreen in
// a fresh browser context) — this file does not touch `API_ORIGIN` and makes no assertions
// through the API directly. It DOES now read `DATABASE_URL` (read-only, see the SELF-PACING
// section below) to pace its own two auth calls against the real shared rate-limit bucket rather
// than trusting a fixed call count to stay safe; that is Postgres access purely for pacing, not
// for the DS assertions themselves. Only the LIGHT theme is checked — `App.tsx` hardcodes
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
// somewhere in the sequence".
//
// SELF-PACING NOW, NOT JUST A REDUCED CALL COUNT (#336 CI investigation, Salih — supersedes the
// "no DB access by design" half of Musti's #223 ruling below, kept intact for the record). This
// file used to lean on "`breakpoint-layout.mjs`'s own three sign-ups stay safe today because its
// CockpitScreen flows between them take real time — a gap, not a remaining-count" and on its own
// reduced call count (one account for the whole file, see below) plus the fail-fast 429 guard
// as the only defence. #336 (query-client.ts moving the app's retry backoff from 3×1s/2s/4s to
// 2×400ms/800ms — client-side only, strictly fewer requests) shrank that "real time" gap: each of
// `breakpoint-layout.mjs`'s three CockpitScreen LoadError flows now settles in ~1.2s of retry
// wait instead of ~7s (the exact number #307's own control proof measured), which compresses its
// per-breakpoint loop from ~10.3s to ~4.3-4.5s. That is well inside the 10s window, so its own
// three sign-ups land close enough together to leave the shared bucket at 3/3 by `bp=l` — and
// THIS file's one sign-up, ~1.6s later, was the 4th call in the window. Reproduced 2/2 on #336's
// head (identical ~4.4s/4.5s/1.6s deltas both times); a control run on `main` the same day showed
// the old ~10.3s cadence resetting the window before every call, so this file's own sign-up
// always found a nearly-empty bucket. The fix is not "wait longer" (a sleep) or "raise the bucket"
// — the pacer already exists (`e2e/harness/rate-limit.mjs`, `waitForBucketHeadroom`) and every
// other multi-call script in this job (`device-authorization.mjs`, `return-visit.mjs`,
// `no-client-persistence.mjs`) already reads the REAL bucket state before spending a call rather
// than trusting whatever gap the previous script happened to leave. This file now does the same:
// it reads (never clears, never writes) the `RateLimit` row for the exact path it is about to
// call and waits out the remainder of the window if it is already at cap. Musti's #223 ruling
// that "the DS check never touches Postgres" held while a fixed call count was a reliable proxy
// for bucket headroom; it stopped being one the moment something upstream in the SAME job could
// change how much real time that count spans. `DATABASE_URL` is already present in this job's
// `env:` block for every step (ci.yml), so this costs nothing new to provision.
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
// It is what keeps this file's OWN pacing wait small (at most one path's headroom, not three).
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
import { guardAgainst429 } from '../harness/browser.mjs'
import { makeSql } from '../harness/stack.mjs'
import { fail, readBucketByExactKey, waitForBucketHeadroom } from '../harness/rate-limit.mjs'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')
const sql = makeSql(requireEnv('DATABASE_URL'))

// better-auth's own built-in rule (apps/api/src/auth/better-auth.ts:169-187) — same constant
// every other self-pacing script in this job uses (`return-visit.mjs`, `no-client-persistence.mjs`).
const AUTH_BUCKET = { windowMs: 10_000, max: 3 }

function waitForRateLimit(bucket, config, label) {
  return waitForBucketHeadroom(bucket, config, label, 'banner-ds-qa')
}

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

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`not a #rrggbb hex colour: ${hex}`)
  const [, r, g, b] = match
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`
}

// `guardAgainst429` (fail-fast on a 429 instead of letting the caller's own subsequent `waitFor`
// surface it ten seconds later as an unexplained heading timeout — Musti's #223 review, F7) is
// now imported from `../harness/browser.mjs`'s canonical version rather than a local copy (this
// file used to carry a byte-identical one — the exact duplication `e2e/harness/README.md`'s "Not
// done in this pass" note flagged as ready to close "once a script already needs to change for
// another reason"; the #336 pacing fix above is that reason). It is now a backstop, not the
// primary defence: `waitForRateLimit` paces every real call against the actual bucket state
// first, so this guard firing at all is itself a signal the pacer missed something — a
// regression that spends MORE calls than the pacer accounted for, exactly the class
// `visibility-refetch.mjs`'s own header names as what pacing alone cannot see.

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
    guardAgainst429(page, fail, '/api/auth/')
    await skipSplash(page)
    await page.getByText(COPY.register, { exact: true }).click()
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill(PASSWORD)
    // Read the real bucket right before spending the call — never assumed safe from a fixed
    // call count (see the header comment's #336 section).
    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
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
    guardAgainst429(page, fail, '/api/auth/')
    await skipSplash(page)
    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(PASSWORD)
    // Read the real bucket right before spending the call — never assumed safe from a fixed
    // call count (see the header comment's #336 section).
    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
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
