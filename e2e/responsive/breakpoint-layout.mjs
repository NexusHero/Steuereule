// Responsive breakpoint layout gate (ADR-0014).
//
// Proves that the useBreakpoint hook + screen-level structural switch produce the
// correct maxWidth at different viewport widths. Tests REAL browser rendering — not
// just the hook's resolveBreakpoint pure function (which is covered by unit tests in
// @steuereule/ui), but the full chain: viewport → useWindowDimensions → hook →
// StyleSheet → rendered element.
//
// This catches regressions the unit/integration layer cannot:
//   - React-Native-Web's useWindowDimensions not updating on resize
//   - makeStyles producing wrong maxWidth values
//   - The hook being called deep in sub-components (anti-pattern per ADR-0014)
//   - CSS custom-property resolution failures on the breakpoint tokens
//
// #177 adds a second class of assertion below (`measureButtonFillsParent*`): that
// `packages/ui/Button`'s container actually renders at `width: 100%` of its immediate
// parent — the DS's `.fk-btn { width: 100% }` contract (komponenten.css:12). This is
// NOT provable at the unit-test layer: `Button.test.tsx` runs on jsdom, which performs
// no layout, so `getBoundingClientRect()` is unconditionally zero there. This script,
// which already boots a real bundle in a real browser, is the only place in the repo
// that can answer "is it actually full width".
//
// Assumes the caller has already booted:
//   - The exported web bundle statically served on WEB_ORIGIN (see
//     cross-origin/static-server.mjs), built with EXPO_PUBLIC_API_BASE_URL pointing at
//     a real, reachable API origin.
//   - The real API behind that baked-in origin (Postgres migrated, guest sessions and
//     better-auth email/password sign-up working) — the maxWidth assertions below are
//     read-only and don't need it, but the #177 Button assertions drive a real guest
//     onboarding and a real account sign-up through the app, so the API must be live.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

import { chromium } from 'playwright-core'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')

// Breakpoint token values (must match @steuereule/tokens dist/theme.ts)
const BP = { s: 375, m: 768, l: 1280 }

// Expected maxWidth per breakpoint zone (must match screen makeStyles)
const EXPECTED_MAX_WIDTH = {
  s: 460,   // mobile/narrow layout
  m: 960,   // wide layout (m and l share the same wide container)
  l: 960,
}

// German copy the #177 flows below click/fill through (app boots in `de`, ADR-0006).
// Lifted straight from apps/mobile-web/src/i18n/resources.ts — if that copy drifts,
// these selectors go stale and this script fails loudly, which is the point: a screen
// flow this script depends on silently changing shape is exactly the kind of thing a
// merge gate should catch, not paper over with a resilient-but-wrong selector.
const COPY = {
  guest: 'Erstmal als Gast umschauen',
  register: 'Neu hier? Konto anlegen',
  weiter: 'Weiter',
  firstNamePlaceholder: 'Kim',
  lastNamePlaceholder: 'Yilmaz',
  steuerIdPlaceholder: '12 345 678 901',
  steuerNrLater: 'Hab ich nicht zur Hand — später',
  cockpitRetry: 'Noch mal versuchen',
  cockpitEmptyHeading: 'Noch keine Angaben.',
  cockpitRefresh: 'Aktualisieren',
  registrierungEmailPlaceholder: 'du@beispiel.de',
  registrierungPasswordPlaceholder: 'Mindestens 6 Zeichen',
  registrierungSubmit: 'Konto anlegen',
  registrierungSuccessCta: 'Weiter zum Onboarding →',
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

/**
 * Navigate to a screen route, then measure the rendered maxWidth of the
 * screen container element (the ScrollView with screen/wideScreen style).
 */
async function measureScreenMaxWidth(page, route) {
  await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle' })

  // App.tsx has no URL routing (a plain `Stage` state machine) — every route always
  // boots to Splash first, which is a deliberate full-bleed brand screen with no
  // `maxWidth` container of its own. Skip it the same way a real user would (its own
  // documented tap-to-skip affordance, identified by its accessibility label so this
  // never clicks a button on any other screen) so `route` below reaches an actual
  // screen with a `screen-container`, rather than measuring nothing.
  const splashSkip = page.getByRole('button', { name: 'Weiter zur App' })
  if (await splashSkip.count()) {
    await splashSkip.click()
    await page.waitForTimeout(100)
  }

  // The screen container is the top-level ScrollView — in React-Native-Web
  // this renders as a <div> with a maxWidth style. We query by the data-testid
  // attribute that each screen sets on its root ScrollView.
  const container = page.locator('[data-testid="screen-container"]').first()
  if (!(await container.count())) {
    // Fallback: find the element whose computed maxWidth is not "none"
    // This works even if data-testid is not set — we find the outermost
    // element with a constrained maxWidth matching our known values.
    const maxWidth = await page.evaluate(() => {
      const all = document.querySelectorAll('div')
      for (const el of all) {
        const style = getComputedStyle(el)
        const mw = style.maxWidth
        if (mw && mw !== 'none' && mw !== '0px') {
          return mw
        }
      }
      return null
    })
    if (!maxWidth) fail(`No element with constrained maxWidth found at route ${route}`)
    return parseFloat(maxWidth)
  }

  const maxWidth = await container.evaluate((el) => {
    return getComputedStyle(el).maxWidth
  })
  if (maxWidth === 'none') fail(`Screen container maxWidth is 'none' at route ${route}`)
  return parseFloat(maxWidth)
}

/**
 * Test a single viewport width and verify the rendered maxWidth matches
 * the expected value for that breakpoint zone.
 */
async function assertMaxWidthAtViewport(page, viewportWidth, route, label) {
  await page.setViewportSize({ width: viewportWidth, height: 800 })

  // Allow React-Native-Web's useWindowDimensions to re-render after resize
  await page.waitForTimeout(300)

  const measured = await measureScreenMaxWidth(page, route)
  const expected = EXPECTED_MAX_WIDTH[label]

  if (Math.abs(measured - expected) > 1) {
    fail(
      `Viewport ${viewportWidth}px (bp=${label}): expected maxWidth=${expected}, got ${measured} at route ${route}`,
    )
  }
  console.log(
    `[breakpoint-layout] ✅ viewport=${viewportWidth}px bp=${label} route=${route} maxWidth=${measured}`,
  )
}

// ── #177: real-layout proof that Button's container fills its parent ──────────────
//
// Three flows, each driven through a fresh, isolated browser context (its own guest
// session / cookie jar — no state bleeds between breakpoints or between flows):
//
//   1. CockpitScreen `centerScreen` LoadError CTA (:90) — a genuine network failure
//      (the cockpit-summary request aborted, not a mocked response), reached via a
//      real guest sign-up + real onboarding completion.
//   2. CockpitScreen `emptyBlock` Empty-state CTA (:114) — the honest "no tax year
//      data yet" response a fresh guest genuinely gets, no interception needed.
//   3. RegistrierungScreen success-screen CTA (:115) — a real account sign-up, whose
//      call-site `width: '100%'` override this ticket removes as redundant.
//
// Each measures the CTA's own rendered width against its immediate DOM parent's
// rendered width — exactly the contract `width: 100%` establishes, independent of any
// hard-coded pixel constant.

async function measureButtonFillsParent(buttonLocator, label) {
  await buttonLocator.waitFor({ state: 'visible', timeout: 20_000 })
  const { buttonWidth, parentContentWidth } = await buttonLocator.evaluate((el) => {
    const parent = el.parentElement
    if (!(parent instanceof HTMLElement)) return { buttonWidth: el.getBoundingClientRect().width, parentContentWidth: NaN }
    // `width: 100%` resolves against the parent's CONTENT box (padding excluded), not
    // its border box — comparing against `getBoundingClientRect()` on the parent would
    // wrongly fail on any padded parent (every real one here: `centerScreen`/
    // `emptyBlock`/`screen` all carry `paddingHorizontal`). `clientWidth` includes
    // padding but excludes border, so subtract the parent's own computed padding to get
    // the actual box a `width: 100%` child fills.
    const style = getComputedStyle(parent)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    return {
      buttonWidth: el.getBoundingClientRect().width,
      parentContentWidth: parent.clientWidth - paddingLeft - paddingRight,
    }
  })
  if (!Number.isFinite(parentContentWidth)) {
    fail(`${label}: could not measure the button's parent element.`)
  }
  if (Math.abs(buttonWidth - parentContentWidth) > 1) {
    fail(
      `${label}: button width=${buttonWidth}px does not fill its parent's content width=${parentContentWidth}px — ` +
        `the DS's \`.fk-btn { width: 100% }\` contract (komponenten.css:12, #177) is not being honoured.`,
    )
  }
  console.log(`[breakpoint-layout] ✅ ${label} — button fills parent (${buttonWidth}px)`)
}

async function skipSplash(page) {
  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
  // Splash's tap-to-skip is `accessibilityLabel={tr('splash.skipLabel')}` ("Weiter zur
  // App") — identified by name so this can never click a button on any other screen.
  await page.getByRole('button', { name: 'Weiter zur App' }).click()
}

async function continueAsGuestThroughOnboarding(page) {
  await page.getByText(COPY.guest).click()

  // Step 1 — name
  await page.getByPlaceholder(COPY.firstNamePlaceholder).fill('Kim')
  await page.getByPlaceholder(COPY.lastNamePlaceholder).fill('Yilmaz')
  await page.getByRole('button', { name: COPY.weiter }).click()

  // Step 2 — Steuer-ID (any shape-valid 11-digit value; @steuereule/core's own rule)
  await page.getByPlaceholder(COPY.steuerIdPlaceholder).fill('12345678901')
  await page.getByRole('button', { name: COPY.weiter }).click()

  // Step 3 — Steuernummer, skipped via the DS's own "later" idiom (Chip)
  await page.getByText(COPY.steuerNrLater).click()

  // Summary — submit (real PUT /v1/profile)
  await page.getByRole('button', { name: COPY.weiter }).click()
}

async function measureCockpitLoadError(browser, width, label) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  try {
    const page = await context.newPage()
    // A genuine network failure, not a mocked response body: the browser actually
    // aborts the request, so TanStack Query's real retry/error path is what's under
    // test (same technique Musti/Salih used verifying #191 live).
    await page.route('**/v1/steuerjahre/*/cockpit*', (route) => route.abort())
    await skipSplash(page)
    await continueAsGuestThroughOnboarding(page)
    const retryButton = page.getByRole('button', { name: COPY.cockpitRetry })
    await measureButtonFillsParent(retryButton, `CockpitScreen LoadError CTA (bp=${label})`)
  } finally {
    await context.close()
  }
}

async function measureCockpitEmpty(browser, width, label) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  try {
    const page = await context.newPage()
    await skipSplash(page)
    await continueAsGuestThroughOnboarding(page)
    // A fresh guest genuinely has no tax year yet — confirm the Empty state (not
    // Loaded, which would coincidentally pass the same width assertion for an
    // unrelated, already-correct call site and mask a real regression here).
    await page.getByText(COPY.cockpitEmptyHeading).waitFor({ state: 'visible', timeout: 20_000 })
    const refreshButton = page.getByRole('button', { name: COPY.cockpitRefresh })
    await measureButtonFillsParent(refreshButton, `CockpitScreen Empty CTA (bp=${label})`)
  } finally {
    await context.close()
  }
}

async function measureRegistrierungSuccess(browser, width, label) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  try {
    const page = await context.newPage()
    await skipSplash(page)
    await page.getByText(COPY.register).click()
    const email = `kaan-177-e2e-${label}-${Date.now()}@example.com`
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill('a-fine-strong-password-1')
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()
    const cta = page.getByRole('button', { name: COPY.registrierungSuccessCta })
    // Pins RegistrierungScreen:115 — its own `width: '100%'` override is now removed
    // as redundant (Musti confirmed the box resolves identically; this is that proof).
    await measureButtonFillsParent(cta, `RegistrierungScreen success CTA (bp=${label})`)
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()

    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    // Prove the web bundle boots
    await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
    if (pageErrors.length > 0) {
      fail(`Web bundle threw at boot: ${pageErrors.join('; ')}`)
    }
    console.log('[breakpoint-layout] web bundle booted cleanly')

    // ── Test each breakpoint zone ──────────────────────────────────────

    // Mobile (s): viewport at token boundary value
    await assertMaxWidthAtViewport(page, BP.s, '/', 's')

    // Just below m boundary — still "s"
    await assertMaxWidthAtViewport(page, BP.m - 1, '/', 's')

    // At m boundary — now "m" (wide)
    await assertMaxWidthAtViewport(page, BP.m, '/', 'm')

    // Between m and l — still "m"
    await assertMaxWidthAtViewport(page, 1024, '/', 'm')

    // Just below l boundary — still "m"
    await assertMaxWidthAtViewport(page, BP.l - 1, '/', 'm')

    // At l boundary — now "l"
    await assertMaxWidthAtViewport(page, BP.l, '/', 'l')

    // Above l — still "l"
    await assertMaxWidthAtViewport(page, 1920, '/', 'l')

    // ── Test screen routes (if app renders them unauthenticated) ────────
    // Login route should always be accessible
    await assertMaxWidthAtViewport(page, BP.s, '/login', 's')
    await assertMaxWidthAtViewport(page, BP.l, '/login', 'l')

    // ── #177: Button fills its parent at every breakpoint — the mandatory real-
    // layout proof (Musti's refinement, F3/F4). Each of the three target CTAs is
    // checked at s/m/l, each in its own isolated browser context. ──────────────────
    for (const [label, width] of Object.entries(BP)) {
      await measureCockpitLoadError(browser, width, label)
      await measureCockpitEmpty(browser, width, label)
      await measureRegistrierungSuccess(browser, width, label)
    }

    console.log('[breakpoint-layout] PASS — all breakpoint layout assertions succeeded.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[breakpoint-layout] FAIL —', error?.message ?? error)
  process.exit(1)
})
