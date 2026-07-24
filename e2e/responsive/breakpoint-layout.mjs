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
// Assumes the caller has already booted:
//   - The exported web bundle statically served on WEB_ORIGIN (see
//     cross-origin/static-server.mjs)
//   No API origin needed — layout tests are read-only, no auth required.
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

    console.log('[breakpoint-layout] PASS — all breakpoint layout assertions succeeded.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[breakpoint-layout] FAIL —', error?.message ?? error)
  process.exit(1)
})
