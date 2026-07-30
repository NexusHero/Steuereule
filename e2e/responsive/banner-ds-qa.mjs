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
// SHARED-RATE-LIMIT-BUCKET CONSTRAINT (found running this in CI, first #223 attempt, ef5930c):
// better-auth's built-in special-path rule for `/sign-up*`/`/sign-in*` is window=10s/max=3
// (apps/api/src/auth/better-auth.ts:169-187) — a real, load-bearing REQ-010 control, never
// loosened for CI. In THIS job specifically, the API logs "Rate limiting could not determine a
// client IP and is falling back to a single shared per-path bucket" — every script's sign-up/
// sign-in calls in this job compete for the SAME bucket, not one per script. The original version
// of this script created one fresh account per breakpoint (3 sign-ups + 3 sign-ins = 6 auth
// calls) and ran immediately after `breakpoint-layout.mjs`'s own 3 real sign-ups in the same job
// — combined, that overran the shared bucket and the job went red on `bp=l` (the 6th-ish call in
// the window), not on anything this script actually measures. Fixed by using exactly ONE account
// for the whole file: one real sign-up (RegistrierungScreen) and one real sign-in with that same
// account (LoginScreen), sweeping all three breakpoints on the SAME already-mounted page via
// `page.setViewportSize` (the same resize technique `breakpoint-layout.mjs`'s
// `assertMaxWidthAtViewport` already uses) instead of a new browser context + new account per
// width. Two auth calls total, not six. **Any future step added to this job that also drives
// sign-up/sign-in must budget against this same shared bucket** — it is not this script's
// private quota.
//
// Locator note: neither banner nor its heading carries a `testID` on either screen — both use
// `accessibilityRole="alert"` only (confirmed directly against RegistrierungScreen.tsx /
// LoginScreen.tsx). Selectors below are role + the resolved i18n copy, never a `data-testid`.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

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

async function skipSplash(page) {
  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

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
 * spends exactly one auth call per screen, not one per breakpoint (see the shared-rate-limit-
 * bucket header comment above for why that matters in this job).
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
