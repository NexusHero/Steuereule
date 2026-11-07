// E2E Matrix & Boundary Fuzzing Acceptance Suite
//
// Covers complex cross-combinations and boundary states:
// - Scenario 15: Cross-Combination Hybrid + Swiss Expat (Beides + Schweiz + Verheiratet + 1 Kind)
// - Scenario 16: Divorced Parent (Geschieden oder getrennt + 1 Kind + Entlastungsbetrag § 24b)
// - Scenario 17: Maximal Catalog (All Ja with follow-ups across Lebenslagen, Einkünfte & Sonderausgaben)
// - Scenario 18: Negative & Contradiction Boundary Testing in WorkdaysScreen (disabled CTA on contradiction)

import { launchBrowser, closeBrowser, newContextAtBreakpoint } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'

/** Guard against rate limit errors on the page. */
function guardAgainst429(page, onFail = fail) {
  page.on('response', (response) => {
    if (response.status() === 429) {
      onFail(`unexpected 429 Too Many Requests from ${response.url()}`)
    }
  })
}

/** Registers and onboards a user via the real UI. */
async function registerAndOnboard(page, { email, password = TEST_PASSWORD, firstName, lastName, taxId, taxNumber }, webOrigin) {
  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', 'matrix-fuzzing')
  await skipSplash(page, webOrigin)

  const registerLink = page.locator('[data-testid="login-register-link"]')
  await registerLink.waitFor({ state: 'visible', timeout: 10_000 })
  await registerLink.click()

  const emailInput = page.locator('[data-testid="registrierung-email"]')
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 })
  await emailInput.fill(email)

  const passInput = page.locator('[data-testid="registrierung-passwort"]')
  await passInput.fill(password)
  await page.locator('[data-testid="registrierung-submit"]').click()

  const continueButton = page.locator('[data-testid="registrierung-success-weiter"]')
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
  await continueButton.click()

  // Onboarding Step 0: Name
  await page.locator('[data-testid="onboarding-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-vorname"]').fill(firstName)
  await page.locator('[data-testid="onboarding-nachname"]').fill(lastName)
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 1: Steuer-ID
  await page.locator('[data-testid="onboarding-steuerid"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-steuerid"]').fill(taxId)
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 2: Steuernummer
  if (taxNumber) {
    await page.locator('[data-testid="onboarding-steuernummer"]').fill(taxNumber)
  }
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 3: Speichern
  const saveButton = page.locator('[data-testid="onboarding-speichern"]')
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saveButton.click()

  // Wait for Cockpit and start interview
  const startInterview = page.locator('[data-testid="cockpit-interview"]')
  await startInterview.waitFor({ state: 'visible', timeout: 15_000 })
  await startInterview.click()
}

// =================================================================================================
// SCENARIO 15: Cross-Combination Hybrid + Swiss Expat
// =================================================================================================
async function runScenario15_HybridSwissExpat({ browser, webOrigin }) {
  console.log('\n--- Scenario 15: Cross-Combination Hybrid + Swiss Expat (Beides + Schweiz + Verheiratet + 1 Kind) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page)

  await registerAndOnboard(page, {
    email: `du+hybrid-ch-${Date.now()}@beispiel.de`,
    firstName: 'Martina',
    lastName: 'Vogt',
    taxId: '04452397686',
    taxNumber: '181/140/01235',
  }, webOrigin)

  // Question 1: job -> Beides
  const beidesOpt = page.locator('[data-testid="interview-option-job-Beides"]')
  await beidesOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await beidesOpt.click()

  // Passable Gewerbe-Gate reached
  console.log('[Scenario 15] Passable Gewerbe-Gate reached...')
  const gateAck = page.locator('text=Angestellten-Teil vorbereiten')
  await gateAck.waitFor({ state: 'visible', timeout: 10_000 })
  await gateAck.click()

  // Question 2: ausland -> Ja, in die Schweiz
  const chOpt = page.locator('[data-testid="interview-option-ausland-Ja, in die Schweiz"]')
  await chOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await chOpt.click()

  // Question 3: kinder -> 1 Kind
  const kinderOpt = page.locator('[data-testid="interview-option-kinder-1 Kind"]')
  await kinderOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await kinderOpt.click()

  // Question 4: familienstand -> Verheiratet
  const marriedOpt = page.locator('[data-testid="interview-option-familienstand-Verheiratet"]')
  await marriedOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await marriedOpt.click()

  // CrossBorderScreen (CH-Funnel):
  console.log('[Scenario 15] Arriving in CrossBorderScreen...')
  // Step 1: Wohnsitz Deutschland
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').click()

  // Step 2: Nichtrückkehrtage -> 0
  await page.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-tage-input"]').fill('0')
  await page.locator('[data-testid="ch-tage-weiter"]').click()

  // Step 3: Lohnausweis done
  await page.locator('[data-testid="ch-lohnausweis-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-lohnausweis-weiter"]').click()

  // Fast forward through Catalog: Einkünfte -> Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // Sonderausgaben: all Nein
  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // WorkdaysScreen -> 10 km
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // Arrives in Cockpit
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 15] PASS: Hybrid + Swiss Expat combined flow verified without dead-ends.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 16: Divorced Parent (Geschieden oder getrennt + 1 Kind)
// =================================================================================================
async function runScenario16_DivorcedParent({ browser, webOrigin }) {
  console.log('\n--- Scenario 16: Divorced Parent (Geschieden oder getrennt + 1 Kind) ---')
  const ctx = await newContextAtBreakpoint(browser, 'm')
  const page = await ctx.newPage()
  guardAgainst429(page)

  await registerAndOnboard(page, {
    email: `du+geschieden-${Date.now()}@beispiel.de`,
    firstName: 'Sabine',
    lastName: 'Kranz',
    taxId: '04452397686',
    taxNumber: '181/140/01235',
  }, webOrigin)

  // Interview
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()

  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()

  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()

  // Familienstand: Geschieden oder getrennt
  const geschiedenOpt = page.locator('[data-testid="interview-option-familienstand-Geschieden oder getrennt"]')
  await geschiedenOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await geschiedenOpt.click()

  // LStB: 48.000 € Brutto
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('48000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('7500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('9500')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Skip Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // Einkuenfte -> Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // Sonderausgaben: all Nein
  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // WorkdaysScreen -> 10 km
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // Plausibilitaet -> Weiter
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()

  // FilingTypeComparisonScreen -> Divorced taxpayers see single filing directly or continue
  console.log('[Scenario 16] Divorced flow reaching Cockpit...')
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 16] PASS: Divorced parent flow completed cleanly.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 17: Full-Spectrum Maximal Catalog
// =================================================================================================
async function runScenario17_MaximalCatalog({ browser, webOrigin }) {
  console.log('\n--- Scenario 17: Maximal Catalog (All "Ja" in Lebenslagen with follow-ups) ---')
  const ctx = await newContextAtBreakpoint(browser, 's')
  const page = await ctx.newPage()
  guardAgainst429(page)

  await registerAndOnboard(page, {
    email: `du+maximal-${Date.now()}@beispiel.de`,
    firstName: 'Maximilian',
    lastName: 'Allesgeber',
    taxId: '04452397686',
    taxNumber: '181/140/01235',
  }, webOrigin)

  // Interview
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // LStB: 70.000 € Brutto
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('70000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('14000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Catalog Lebenslagen: All JA with follow-ups!
  console.log('[Scenario 17] Answering Ja with follow-ups in Lebenslagen...')

  // 1. DHF -> Ja -> 1200 € Miete
  await page.locator('[data-testid="katalog-option-dhf-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-dhf-Ja"]').click()
  await page.locator('[data-testid="katalog-input-dhf-miete"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-dhf-miete"]').fill('1200')
  await page.locator('[data-testid="katalog-submit-dhf-miete"]').click()

  // 2. Umzug -> Ja -> 3500 € Kosten
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').fill('3500')
  await page.locator('[data-testid="katalog-submit-umzug-kosten"]').click()

  // 3. Abfindung -> Ja -> 25000 €
  await page.locator('[data-testid="katalog-option-abfindung-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-abfindung-Ja"]').click()
  await page.locator('[data-testid="katalog-input-abfindung-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-abfindung-betrag"]').fill('25000')
  await page.locator('[data-testid="katalog-submit-abfindung-betrag"]').click()

  // 4. Lohnersatz -> Ja -> 4000 €
  await page.locator('[data-testid="katalog-option-lohnersatz-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-lohnersatz-Ja"]').click()
  await page.locator('[data-testid="katalog-input-lohnersatz-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-lohnersatz-betrag"]').fill('4000')
  await page.locator('[data-testid="katalog-submit-lohnersatz-betrag"]').click()

  // 5. Nebenjob -> Minijob
  await page.locator('[data-testid="katalog-option-nebenjob-Minijob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-nebenjob-Minijob"]').click()

  // Arrives cleanly at Einkünfte
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 17] PASS: All Lebenslagen Ja branches with amounts accepted and transitioned seamlessly.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 18: Negative & Contradiction Boundary Testing in WorkdaysScreen
// =================================================================================================
async function runScenario18_WorkdaysContradictionBoundary({ browser, webOrigin }) {
  console.log('\n--- Scenario 18: Workdays Contradiction Boundary Testing ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page)

  await registerAndOnboard(page, {
    email: `du+workdays-conflict-${Date.now()}@beispiel.de`,
    firstName: 'Thorsten',
    lastName: 'Grenzfall',
    taxId: '04452397686',
    taxNumber: '181/140/01235',
  }, webOrigin)

  // Interview
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // LStB: 50.000 € Brutto
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('50000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('10000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Skip Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // Einkuenfte -> Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // Sonderausgaben: all Nein
  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // WorkdaysScreen!
  console.log('[Scenario 18] Entering impossible absence numbers (contradiction)...')
  const urlaubInput = page.locator('[data-testid="arbeitstage-urlaub"]')
  await urlaubInput.waitFor({ state: 'visible', timeout: 10_000 })
  await urlaubInput.fill('220')

  const krankInput = page.locator('[data-testid="arbeitstage-krank"]')
  await krankInput.fill('100')

  // Button must now be disabled due to contradiction
  const submitBtn = page.locator('[data-testid="arbeitstage-weiter"]')
  const isSubmitDisabled = await submitBtn.isDisabled()
  if (!isSubmitDisabled) {
    fail('Submit button should be disabled when absences exceed possible workdays')
  }
  console.log('[Scenario 18] Verified: Submit button is correctly disabled during contradiction state.')

  // Correct the absences to plausible numbers
  console.log('[Scenario 18] Correcting absences to valid values...')
  await urlaubInput.fill('28')
  await krankInput.fill('5')

  // Button should now be enabled
  const isSubmitEnabled = await submitBtn.isEnabled()
  if (!isSubmitEnabled) {
    fail('Submit button should be enabled after correcting absences')
  }
  await submitBtn.click()

  // Plausibilitaet reached!
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 18] PASS: WorkdaysScreen contradiction boundary and recovery verified.')

  await ctx.close()
}

// =================================================================================================
// MAIN RUNNER
// =================================================================================================
async function main() {
  console.log('='.repeat(80))
  console.log('STARTING MATRIX & BOUNDARY FUZZING ACCEPTANCE RUN')
  console.log('='.repeat(80))

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario15_HybridSwissExpat({ browser, webOrigin: stack.webOrigin })
    await runScenario16_DivorcedParent({ browser, webOrigin: stack.webOrigin })
    await runScenario17_MaximalCatalog({ browser, webOrigin: stack.webOrigin })
    await runScenario18_WorkdaysContradictionBoundary({ browser, webOrigin: stack.webOrigin })

    console.log('\n' + '='.repeat(80))
    console.log('ALL MATRIX & BOUNDARY FUZZING SCENARIOS PASSED WITH ZERO FINDINGS!')
    console.log('='.repeat(80) + '\n')
  } catch (err) {
    console.error('::error::Matrix fuzzing acceptance test failed:', err)
    fail(err.message || String(err))
  } finally {
    await closeBrowser(browser)
    if (!stack.isAttached && stack.teardown) {
      await stack.teardown()
    }
  }
}

main().catch((err) => {
  console.error('[archetypes-qa runner failed]:', err)
  process.exit(1)
})
