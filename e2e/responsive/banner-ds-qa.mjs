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

async function checkRegistrierung(browser, bp, email) {
  const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } })
  try {
    const page = await context.newPage()
    await skipSplash(page)
    await page.getByText(COPY.register, { exact: true }).click()
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill('Sicheres-Passwort-1!')
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()
    await page.getByText(COPY.registrierungSuccessHeading).waitFor({ state: 'visible', timeout: 10_000 })
    await measureBanner(page, `RegistrierungScreen (bp=${bp.name})`)
  } finally {
    await context.close()
  }
}

async function checkLogin(browser, bp, email) {
  const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } })
  try {
    const page = await context.newPage()
    await skipSplash(page)
    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill('Sicheres-Passwort-1!')
    await page.getByRole('button', { name: COPY.loginSubmit }).click()
    await page.getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 10_000 })
    await measureBanner(page, `LoginScreen (bp=${bp.name})`)
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const bp of BREAKPOINTS) {
      // A fresh account per breakpoint (rather than one shared account) keeps each breakpoint's
      // pass independent — no ordering dependency, no state bleeding across viewport sizes.
      const email = `banner-ds-qa-${bp.name}-${Date.now()}@beispiel.de`
      await checkRegistrierung(browser, bp, email)
      // Same account, driven through LoginScreen's own sign-in form in a fresh context — no
      // out-of-band API call and no DB access needed; the account already exists from the
      // RegistrierungScreen pass above.
      await checkLogin(browser, bp, email)
    }
    console.log('[banner-ds-qa] PASS — verify-banner DS fidelity holds on both screens, all breakpoints.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[banner-ds-qa] FAIL —', error?.message ?? error)
  process.exit(1)
})
