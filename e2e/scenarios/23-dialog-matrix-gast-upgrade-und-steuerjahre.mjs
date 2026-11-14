// Scenario 23: Deep Dialog Matrix — Guest-to-Account Upgrade (rememberedPendingPath) & Multi-Tax-Year Isolation
// Tests starting as a Guest -> Interview -> Konto-Wand -> Registering directly from Konto-Wand -> Onboarding ->
// Automatic resumption of the exact funnel path ('ch'), plus switching between 2025 and 2026 on Cockpit.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTH_BUCKET,
  TEST_PASSWORD,
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  waitForBucketHeadroom,
  skipSplash,
  selectTaxYear,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario23(browser, webOrigin) {
  console.log('\n--- Scenario 23: Dialog Matrix — Guest-to-Account Upgrade & Multi-Tax-Year Isolation ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', 'scenario-23')
  await skipSplash(page, webOrigin)

  // 1. Start as Guest on LoginScreen
  const guestBtn = page.locator('[data-testid="login-guest-link"]')
  await guestBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await guestBtn.click()

  // 2. Complete Interview as Guest choosing Swiss Cross-Border path ('ch')
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Ja, in die Schweiz"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // 3. Arrives on Konto-Wand showing "Grenzgänger CH" path -> Click "Konto anlegen und weitermachen"
  await page.locator('text=Grenzgänger CH').waitFor({ state: 'visible', timeout: 10_000 })
  const registerFromWallBtn = page.locator('text=Konto anlegen und weitermachen')
  await registerFromWallBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await registerFromWallBtn.click()

  // 4. Complete Registration & Onboarding
  const email = `du+matrix.gastupgrade.${Date.now()}@beispiel.de`
  await page.locator('[data-testid="registrierung-email"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="registrierung-email"]').fill(email)
  await page.locator('[data-testid="registrierung-passwort"]').fill(TEST_PASSWORD)
  await page.locator('[data-testid="registrierung-submit"]').click()

  const continueButton = page.locator('[data-testid="registrierung-success-weiter"]')
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
  await continueButton.click()

  await page.locator('[data-testid="onboarding-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-vorname"]').fill('Lukas')
  await page.locator('[data-testid="onboarding-nachname"]').fill('Gastupgrade')
  await page.locator('[data-testid="onboarding-weiter"]').click()

  await page.locator('[data-testid="onboarding-steuerid"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-steuerid"]').fill('04452397686')
  await page.locator('[data-testid="onboarding-weiter"]').click()
  await page.locator('[data-testid="onboarding-weiter"]').click()

  const saveButton = page.locator('[data-testid="onboarding-speichern"]')
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saveButton.click()

  // 5. Verify rememberedPendingPath ('ch') automatically opens CrossBorderScreen after Onboarding!
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 15_000 })
  console.log('[Scenario 23] Verified: Guest-to-Account upgrade automatically resumed CrossBorderScreen (rememberedPendingPath).')

  // Return to Cockpit by closing the Sheet (TabBar is hidden while Sheet is open)
  await page.locator('[data-testid="sheet-schliessen"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 6. Multi-Tax-Year Isolation (the guest starts on the last completed year since UX review K2): 2025 (migrated from Guest with CH path) vs 2026 (fresh year)
  await selectTaxYear(page, 2025)
  await page.locator('[data-testid="cockpit-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })

  // Switch to 2026 -> 2026 must still be untouched and show its fresh interview CTA (`cockpit-interview`)
  await selectTaxYear(page, 2026)
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // Fill LStB for 2026
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('80000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('18000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('14000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Return to Cockpit and check 2026 now has `cockpit-weiter` (Angestellte)
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await page.locator('[data-testid="cockpit-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })

  // Switch back to 2025 -> 2025 must still have its migrated Grenzgänger CH path (`cockpit-weiter`)
  await selectTaxYear(page, 2025)
  await page.locator('[data-testid="cockpit-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })

  console.log('[Scenario 23] PASS: Guest-to-Account upgrade and strict 2025/2026 tax-year isolation verified.')
  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 23: Dialog Matrix — Guest Upgrade & Tax Year Isolation', runScenario23).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
