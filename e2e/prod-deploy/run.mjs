// Production-deploy smoke gate (#76 — the stakeholder's own local Docker reproduction).
//
// THE CLASS OF BUG THIS EXISTS TO CATCH: the stakeholder built a Docker setup by hand
// (API on :3000, web on :8080) and got all four symptoms at once — no Google button,
// "Erstmal als Gast umschauen" -> "Das hat nicht geklappt.", account creation failing,
// no QR code. Kaan's real-stack reproduction (PR discussion, #239-adjacent) found ALL FOUR
// are the SAME root cause wearing four faces: the browser genuinely could not reach the
// API, so every screen hit its own honestly-implemented error state. The likely mechanism
// is exactly what e2e/harness/README.md already documents — `expo export` without
// `--clear` baking in a stale EXPO_PUBLIC_API_BASE_URL, or CORS_ALLOWED_ORIGINS/
// WEB_APP_URL not matching the origin the browser is actually on.
//
// WHAT MAKES THIS GATE DIFFERENT FROM cross-origin-smoke/breakpoint-layout.mjs/
// device-authorization.mjs: those all attach to a stack assembled by hand-typed `run:`
// steps in ci.yml (build the API with `tsc`, run it with `node --import tsx`, `expo
// export` + a bare static server, all directly on the runner). This script attaches to
// the ACTUAL docker-compose.prod.yml stack — the real Dockerfiles, the real `docker
// compose build`, the real container boot order — because "the individual pieces work"
// and "the shipped artifact works" are different claims, and the stakeholder's own bug
// report was proof positive of the gap between them (see this repo's own README-facing
// note on this PR).
//
// Assumes the caller has already run, from the repo root:
//   cp .env.example .env
//   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
// and waited for API_ORIGIN/WEB_ORIGIN (the published ports) to answer — this script
// attaches via e2e/harness/stack.mjs's ATTACH mode (API_ORIGIN/WEB_ORIGIN/DATABASE_URL
// already set), it does not build or boot anything itself.
//
// Five checks, covering all FOUR of the stakeholder's own exact-worded symptoms plus the
// account this whole gate proves end to end:
//   1. Guest — "Erst mal als Gast umschauen" through onboarding to Cockpit, no error.
//   2. Registration — a real account, created for real (Konto anlegen).
//   3. Login — signing back in with that same account.
//   4. The Google button — asserted inside loginFlow() (Musti's #274 review, F4): the
//      stakeholder's own FIRST-quoted symptom ("Google-Button fehlt komplett") was, until
//      this pass, listed here but never actually checked — a curl against
//      /v1/auth/capabilities (this job's own readiness step) proves the API side only,
//      not that the browser renders the button (that reads the capability probe against
//      whatever origin is baked into THIS web bundle, a genuinely different claim).
//   5. QR code — the device-authorization column actually renders a user_code, not just
//      an "Erneut versuchen" retry button.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

import { launchBrowser, closeBrowser, newContextAtBreakpoint } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts —
// exact strings, including the two the stakeholder himself quoted.
const COPY = {
  splashSkip: 'Weiter zur App',
  guest: 'Erstmal als Gast umschauen',
  register: 'Neu hier? Konto anlegen',
  weiter: 'Weiter',
  firstNamePlaceholder: 'Kim',
  lastNamePlaceholder: 'Yilmaz',
  steuerIdPlaceholder: '12 345 678 901',
  steuerNrLater: 'Hab ich nicht zur Hand — später',
  onboardingLoadErrorHeading: 'Das hat nicht geklappt.', // the stakeholder's own quoted words
  registrierungEmailPlaceholder: 'du@beispiel.de',
  registrierungPasswordPlaceholder: 'Mindestens 6 Zeichen',
  registrierungSubmit: 'Konto anlegen',
  registrierungSuccessCta: 'Weiter zum Onboarding →',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  loginGoogleButton: 'Weiter mit Google',
  tabCockpit: 'Cockpit',
  errGeneric: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
  errInvalidCredentials: 'E-Mail oder Passwort stimmen nicht.',
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

async function skipSplash(page, webOrigin) {
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
  await page.getByText(COPY.guest).waitFor({ state: 'visible', timeout: 10_000 })
}

// --- Flow 1: guest browsing (the stakeholder's own first complaint) -----------------------
async function guestFlow(browser, webOrigin) {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } })
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await skipSplash(page, webOrigin)
    if (pageErrors.length > 0) {
      fail(`Web bundle threw during guest flow: ${pageErrors.join('; ')}`)
    }
    console.log('[prod-deploy] web bundle booted cleanly, guest CTA visible')

    await page.getByText(COPY.guest).click()

    // FOUND FIXING THE ADR-0021 CONTROL PROOF (2026-08-05): OnboardingScreen's own step 1 (name
    // entry, the very field below) is ALREADY gated behind its first real request to the API
    // (`useProfileControllerGetProfile()` — GET /v1/profile) — `OnboardingScreen.tsx`'s own
    // `profileQuery.isPending`/`.isError` early returns render `OnboardingLoading`/
    // `OnboardingLoadError` INSTEAD of the step-1 form, not just step 2 as this script's first
    // version assumed. A wrong EXPO_PUBLIC_API_BASE_URL therefore fails here, at the FIRST
    // field, not the second — this script's own earlier version filled `firstNamePlaceholder`
    // unconditionally and only raced load-error against the *second* field, so on a real
    // API-unreachable break it produced a bare, undiagnostic `locator.fill: Timeout 30000ms
    // exceeded` instead of naming the cause. Fixed by racing load-error against the FIRST
    // field instead — the same pattern already used for step 2 below, just moved to where the
    // gating actually is.
    const nameLoadError = page.getByText(COPY.onboardingLoadErrorHeading)
    const firstNameField = page.getByPlaceholder(COPY.firstNamePlaceholder)
    await Promise.race([
      nameLoadError.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
      firstNameField.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    ])
    if (await nameLoadError.count()) {
      fail(
        `Guest flow: onboarding shows "${COPY.onboardingLoadErrorHeading}" on its very first step — the ` +
          'exact error the stakeholder reported. The browser could not reach the API from the exported web ' +
          'bundle (stale EXPO_PUBLIC_API_BASE_URL baked into the bundle, or a CORS_ALLOWED_ORIGINS/WEB_APP_URL ' +
          'mismatch against the real published origin — see this file\'s own header comment).',
      )
    }
    if (!(await firstNameField.count())) {
      fail('Guest flow: neither onboarding step 1 nor the load-error state appeared within 15s.')
    }

    await firstNameField.fill('Kim')
    await page.getByPlaceholder(COPY.lastNamePlaceholder).fill('Yilmaz')
    await page.getByRole('button', { name: COPY.weiter }).click()

    // Step 2 (Steuer-ID) needs no SECOND network round-trip of its own (the profile is already
    // loaded in memory at this point) — but kept as a race, not a bare fill, for the same
    // reason: a regression here should name itself, not time out silently.
    const loadError = page.getByText(COPY.onboardingLoadErrorHeading)
    const steuerIdField = page.getByPlaceholder(COPY.steuerIdPlaceholder)
    await Promise.race([
      loadError.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
      steuerIdField.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    ])
    if (await loadError.count()) {
      fail(
        `Guest flow: onboarding shows "${COPY.onboardingLoadErrorHeading}" after step 1 — unexpected, ` +
          'since the profile was already loaded once to reach step 1 at all.',
      )
    }
    if (!(await steuerIdField.count())) {
      fail('Guest flow: neither onboarding step 2 nor the load-error state appeared within 15s.')
    }

    await steuerIdField.fill('12345678901')
    await page.getByRole('button', { name: COPY.weiter }).click()
    await page.getByText(COPY.steuerNrLater).click()
    await page.getByRole('button', { name: COPY.weiter }).click()

    // Reaching this point means the real PUT /v1/profile against the real, containerised
    // API succeeded — the guest flow genuinely completed, not merely "didn't show an error".
    await page.getByRole('tab', { name: COPY.tabCockpit }).waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
      // Fallback locator, in case the accessibilityRole="tab" -> role="tab" mapping ever
      // changes shape (packages/ui/src/components/TabBar.tsx) — either way, something past
      // onboarding must be visible.
      await page.getByText(COPY.tabCockpit).first().waitFor({ state: 'visible', timeout: 5_000 })
    })
    console.log('[prod-deploy] PASS — guest flow reached Cockpit through the real containerised API.')
  } finally {
    await context.close()
  }
}

// --- Flow 2: registration (the stakeholder's own "Konto anlegen geht nicht") --------------
async function registrationFlow(browser, webOrigin) {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } })
  try {
    const page = await context.newPage()
    await skipSplash(page, webOrigin)
    await page.getByText(COPY.register).click()

    const email = `prod-deploy-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const password = 'a-fine-strong-password-1'
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill(password)
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()

    await page.getByRole('button', { name: COPY.registrierungSuccessCta }).waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[prod-deploy] PASS — registration created a real account (${email}) against the containerised API.`)
    return { email, password }
  } finally {
    await context.close()
  }
}

// --- Flow 3: login with the account just created -------------------------------------------
async function loginFlow(browser, webOrigin, { email, password }) {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } })
  try {
    const page = await context.newPage()
    await skipSplash(page, webOrigin)

    // The stakeholder's own FIRST-quoted symptom (Musti's #274 review, F4): a
    // curl against /v1/auth/capabilities (this job's own readiness step) proves the API
    // is willing to offer the provider — it does NOT prove the browser renders the
    // button, which is a genuinely different claim (`useSocialSignInAvailable` reads the
    // capability probe against the origin actually baked into THIS web bundle). Without
    // this assertion, a GOOGLE_CLIENT_ID missing/wrong in .env — every other flow still
    // green — would sail straight through this gate uncaught, exactly the class of
    // omission REQ-008's own honesty rule exists to prevent.
    await page.getByText(COPY.loginGoogleButton).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail(`Login flow: "${COPY.loginGoogleButton}" button did not render — the stakeholder's own first-reported symptom.`)
    })

    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(password)
    await page.getByRole('button', { name: COPY.loginSubmit }).click()

    const invalidCreds = page.getByText(COPY.errInvalidCredentials)
    const genericErr = page.getByText(COPY.errGeneric)
    const loginGone = page.getByRole('button', { name: COPY.loginSubmit }).waitFor({ state: 'hidden', timeout: 15_000 })
    await Promise.race([
      invalidCreds.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
      genericErr.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
      loginGone.catch(() => {}),
    ])
    if (await invalidCreds.count()) fail(`Login flow: got "${COPY.errInvalidCredentials}" for the account registrationFlow() just created.`)
    if (await genericErr.count()) fail(`Login flow: got "${COPY.errGeneric}" — the browser could not reach the API.`)
    if (await page.getByRole('button', { name: COPY.loginSubmit }).count()) {
      fail('Login flow: the Einloggen button is still on screen 15s after submit — login neither succeeded nor surfaced a named error.')
    }
    console.log('[prod-deploy] PASS — login succeeded against the containerised API with the account just registered.')
  } finally {
    await context.close()
  }
}

// --- Flow 4: the QR code (the stakeholder's own "kein QR-Code, nur Erneut versuchen") -----
async function qrFlow(browser, webOrigin) {
  // Wide breakpoint only — the QR column renders at m/l (Decision 3a), matching
  // e2e/device/device-authorization.mjs's own Context A.
  const context = await newContextAtBreakpoint(browser, 'l')
  try {
    const page = await context.newPage()
    const codeResponsePromise = page
      .waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/v1/device/code'), { timeout: 15_000 })
      .catch(() => null)
    await skipSplash(page, webOrigin)

    const codeResponse = await codeResponsePromise
    if (!codeResponse) {
      fail(
        'QR flow: no POST /v1/device/code was observed within 15s of Login mounting at the `l` breakpoint — ' +
          'the QR column never even attempted to mint a code (the exact "kein QR-Code, nur Erneut versuchen" shape).',
      )
    }
    if (codeResponse.status() !== 201) {
      fail(`QR flow: POST /v1/device/code returned ${codeResponse.status()}, expected 201.`)
    }
    const deviceCode = await codeResponse.json()
    await page.getByText(deviceCode.userCode, { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
    console.log(`[prod-deploy] PASS — QR column rendered a real user_code (${deviceCode.userCode}) from the containerised API.`)
  } finally {
    await context.close()
  }
}

async function main() {
  const { apiOrigin, webOrigin } = await startStack()
  console.log(`[prod-deploy] attached — API ${apiOrigin}, web ${webOrigin}`)

  const browser = await launchBrowser()
  try {
    await guestFlow(browser, webOrigin)
    const account = await registrationFlow(browser, webOrigin)
    await loginFlow(browser, webOrigin, account)
    await qrFlow(browser, webOrigin)
    console.log('[prod-deploy] PASS — all four of the stakeholder\'s own flows work against the real docker-compose.prod.yml stack.')
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[prod-deploy] FAIL —', error?.message ?? error)
  process.exit(1)
})
