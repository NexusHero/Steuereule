// Dark-mode appearance & persistence E2E gate (#443 slice 6).
//
// Emulates `colorScheme: 'dark'` in a real headless Chromium browser against the live API and
// exported web bundle, verifies that `document.body` adopts `theme.dark.color.grund` across
// Cockpit, a Sheet mask, and Profil, switches to `Immer hell` (`profil-darstellung-hell`), and
// confirms the light `grund` background persists across a full page reload.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// Must match @steuereule/tokens `theme.dark.color.grund` (#12140c) and `theme.light.color.grund` (#f4f2e9).
const DARK_GRUND_RGB = 'rgb(18, 20, 12)'
const LIGHT_GRUND_RGB = 'rgb(244, 242, 233)'

async function waitForBodyBackground(page, expectedRgb, label) {
  try {
    await page.waitForFunction(
      (targetRgb) => getComputedStyle(document.body).backgroundColor === targetRgb,
      expectedRgb,
      { timeout: 10_000 },
    )
  } catch {
    const actual = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    fail(`${label}: expected document.body background ${expectedRgb}, got ${actual}`)
  }
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()

  try {
    const email = `dark-mode-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', 'dark-mode')
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 'm', { colorScheme: 'dark' })
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')

    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', 'dark-mode')
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()

    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await page.locator('[data-testid="cockpit-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
    await waitForBodyBackground(page, DARK_GRUND_RGB, 'Cockpit (system dark)')
    console.log('[dark-mode] ✅ Cockpit inherits dark grund under OS colorScheme="dark"')

    await page.locator('[data-testid="cockpit-kapital"]').click()
    await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'visible', timeout: 10_000 })
    await waitForBodyBackground(page, DARK_GRUND_RGB, 'Mask sheet (system dark)')
    console.log('[dark-mode] ✅ Mask renders under dark theme')

    await page.locator('[data-testid="sheet-schliessen"]').click()
    await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

    await page.getByRole('tab', { name: FLOW_COPY.profilTab }).click()
    const systemOption = page.locator('[data-testid="profil-darstellung-system"]')
    const lightOption = page.locator('[data-testid="profil-darstellung-hell"]')
    await lightOption.waitFor({ state: 'visible', timeout: 10_000 })
    await waitForBodyBackground(page, DARK_GRUND_RGB, 'Profil (system dark)')

    if ((await systemOption.getAttribute('aria-pressed')) !== 'true') {
      fail('Profil: expected "System" appearance option to be selected initially')
    }

    await lightOption.click()
    await waitForBodyBackground(page, LIGHT_GRUND_RGB, 'Profil after selecting "Immer hell"')
    if ((await lightOption.getAttribute('aria-pressed')) !== 'true') {
      fail('Profil: expected "Immer hell" to become aria-pressed="true" immediately after click')
    }
    console.log('[dark-mode] ✅ Switching to "Immer hell" updates background immediately')

    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-testid="profil-darstellung-hell"]').waitFor({ state: 'visible', timeout: 15_000 })
    await waitForBodyBackground(page, LIGHT_GRUND_RGB, 'Profil after reload')
    if ((await page.locator('[data-testid="profil-darstellung-hell"]').getAttribute('aria-pressed')) !== 'true') {
      fail('Profil: expected "Immer hell" selection to survive reload')
    }
    console.log('[dark-mode] ✅ Light mode preference persisted across reload')

    await ctx.close()
    console.log('[dark-mode] PASS — dark-mode system inheritance and manual override verified.')
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error('[dark-mode] FAIL —', error?.message ?? error)
  process.exit(1)
})
