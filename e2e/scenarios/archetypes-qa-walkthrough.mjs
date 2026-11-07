// Comprehensive Archetypes & Edge Cases E2E Walkthrough
//
// Tests previously unverified user archetypes and edge cases:
// 1. Scenario 9: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate)
// 2. Scenario 10: Florian Weber (Hybrid Employee & Freelancer "Beides" -> Passable Gewerbe-Gate + Employee Return)
// 3. Scenario 11: Klaus Bergmann (Retiree with Private Pension § 22 EStG Ertragsanteil calculation)
// 4. Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate)
// 5. Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting)
// 6. Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparisonScreen § 26a/26b EStG)

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
  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', 'archetypes-qa')
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
  try {
    await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
  } catch (err) {
    const texts = await page.locator('body').innerText()
    console.error('[registerAndOnboard failure body]:', texts)
    throw err
  }
  await continueButton.click()

  // Onboarding Step 0: Name
  await page.locator('[data-testid="onboarding-vorname"]').fill(firstName)
  await page.locator('[data-testid="onboarding-nachname"]').fill(lastName)
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 1: Steuer-ID
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

  // Wait for Cockpit
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 15_000 })
}

/** Asserts Cockpit estimate direction, range or exact message. */
async function assertCockpitEstimate(page, label, { direction, expectedText } = {}) {
  const locator = page.locator('[data-testid="cockpit-erstattung"]')
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  const check = (text) => {
    if (expectedText !== undefined) {
      return text.includes(expectedText) ? null : `expected estimate to contain "${expectedText}"`
    }
    const named = direction === undefined ? ['Erstattung', 'Nachzahlung'].some((w) => text.includes(w)) : text.includes(direction)
    if (!named) return `expected a ${direction ?? 'refund or back-payment'} estimate`
    return null
  }

  const deadline = Date.now() + 15_000
  let text = await locator.innerText()
  let problem = check(text)
  while (problem !== null && Date.now() < deadline) {
    await page.waitForTimeout(500)
    text = await locator.innerText()
    problem = check(text)
  }
  console.log(`[${label}] Cockpit estimate text: "${text}"`)
  if (problem !== null) fail(`[${label}] ${problem}: "${text}"`)
}

// =================================================================================================
// SCENARIO 9: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate)
// =================================================================================================
async function runScenario9_Freelancer(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 9: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+maxi.koch@beispiel.de',
    firstName: 'Maximiliane',
    lastName: 'Koch',
    taxId: '34827190562',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Selbstständig').waitFor({ state: 'visible', timeout: 10_000 })

  // Select "Selbstständig"
  await page.locator('text=Selbstständig').click()

  // Verifies transition to terminal BusinessGate
  const gateHeading = page.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.')
  await gateHeading.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 9] Terminal Gewerbe-Gate reached successfully.')

  // Verify explanation text: Selbstständige brauchen EÜR, Anlage G/S und USt
  const bodyText = page.locator('text=Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer')
  await bodyText.waitFor({ state: 'visible', timeout: 10_000 })

  // Verify that NO continue / forward option exists
  const forwardOption = page.locator('text=Angestellten-Teil vorbereiten')
  if ((await forwardOption.count()) > 0 && (await forwardOption.isVisible())) {
    fail('[Scenario 9] Expected terminal Gewerbe-Gate to offer no forward progression for pure Selbstständige.')
  }

  // Verify back link works
  const backLink = page.locator('text=Zurück zur Frage')
  await backLink.click()
  await page.locator('text=Selbstständig').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 9] PASS: Terminal Gewerbe-Gate and honest gate boundary verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich / "Beides")
// =================================================================================================
async function runScenario10_HybridBeides(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides") ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+florian.weber@beispiel.de',
    firstName: 'Florian',
    lastName: 'Weber',
    taxId: '45918203714',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Beides').waitFor({ state: 'visible', timeout: 10_000 })

  // Select "Beides"
  await page.locator('text=Beides').click()

  // Reaches passable BusinessGate
  await page.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 10] Passable Gewerbe-Gate reached.')

  // Acknowledge passable option
  const acknowledgeOption = page.locator('text=Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')
  await acknowledgeOption.waitFor({ state: 'visible', timeout: 10_000 })
  await acknowledgeOption.click()

  // Continues to question 2 (ausland)
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // Question 3: kinder
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // Question 4: familienstand
  await page.locator('text=Ledig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Ledig').click()

  // Lands in LstbScreen for employed part
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('55000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('10500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('11000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Fast forward to Cockpit by clicking logo
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 10', { direction: 'Erstattung' })
  console.log('[Scenario 10] PASS: Hybrid "Beides" passable gate and employee calculation verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 11: Klaus Bergmann (Retiree with Private Pension § 22 EStG Ertragsanteilsbesteuerung)
// =================================================================================================
async function runScenario11_PrivatePension(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 11: Klaus Bergmann (Retiree with Private Pension § 22 EStG Ertragsanteil) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+klaus.bergmann@beispiel.de',
    firstName: 'Klaus',
    lastName: 'Bergmann',
    taxId: '56192837401',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Rente').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Rente').click()

  // ausland -> Nein
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // kinder -> Nein
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // familienstand -> Ledig
  await page.locator('text=Ledig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Ledig').click()

  // PensionerScreen
  await page.locator('text=Deine Rente').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 11] Selecting Private Rentenversicherung...')

  // Select "Private Rentenversicherung"
  await page.locator('text=Private Rentenversicherung').click()

  // Verify that "Alter bei Rentenbeginn" is shown and "Jahr des Rentenbeginns" is hidden
  const alterInput = page.getByLabel(/Alter bei Rentenbeginn/i)
  await alterInput.waitFor({ state: 'visible', timeout: 10_000 })

  const startJahrInput = page.getByLabel(/Jahr des Rentenbeginns/i)
  if ((await startJahrInput.count()) > 0 && (await startJahrInput.isVisible())) {
    fail('[Scenario 11] Expected "Jahr des Rentenbeginns" to be hidden for Private Rentenversicherung.')
  }

  // Fill figures: 18.000 € Jahresbetrag, Alter bei Rentenbeginn: 66
  const jahresInput = page.getByLabel(/Jahresbetrag der Rente/i)
  await jahresInput.fill('18000')
  await jahresInput.blur()

  await alterInput.fill('66')
  await alterInput.blur()

  // Ertragsanteil for age 66 is 18 % -> 18.000 * 0.18 = 3.240 €
  const steuerpflichtigNotice = page.locator('text=3240 €')
  await steuerpflichtigNotice.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 11] Derived taxable share: 3240 € (18 % Ertragsanteil according to § 22 EStG).')

  // Click Weiter
  await page.locator('text=Weiter').last().click()
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await assertCockpitEstimate(page, 'Scenario 11', { expectedText: 'Die Erstattung rechnen wir bisher nur für Angestellte.' })
  console.log('[Scenario 11] PASS: Private Pension Ertragsanteil calculation and honest cockpit notice verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate)
// =================================================================================================
async function runScenario12_ExpatNonSwiss(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+carlos.santos@beispiel.de',
    firstName: 'Carlos',
    lastName: 'Santos',
    taxId: '67201938455',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Angestellt').click()

  // ausland -> "In ein anderes Land"
  await page.locator('text=In ein anderes Land').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=In ein anderes Land').click()

  // Hits CH-Only Gate
  await page.locator('text=Ehrlich: andere Länder können wir noch nicht.').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 12] CH-Only Gate reached successfully.')

  // Verify explanation regarding bilateral tax agreements (DBA)
  await page.locator('text=Jedes Land hat sein eigenes Abkommen mit eigenen Regeln').waitFor({ state: 'visible', timeout: 10_000 })

  // Continue without foreign income
  const continueOption = page.locator('text=Ohne Auslands-Teil weitermachen')
  await continueOption.waitFor({ state: 'visible', timeout: 10_000 })
  await continueOption.click()

  // Question 3: kinder -> Nein
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // Question 4: familienstand -> Ledig
  await page.locator('text=Ledig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Ledig').click()

  // Completes LStB
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('60000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('11000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('12000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Fast forward to Cockpit
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 12', { direction: 'Erstattung' })
  console.log('[Scenario 12] PASS: CH-Only Gate boundary and continuation flow verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting)
// =================================================================================================
async function runScenario13_Widowed(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+erika.zimmermann@beispiel.de',
    firstName: 'Erika',
    lastName: 'Zimmermann',
    taxId: '78310294566',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Angestellt').click()

  // ausland -> Nein
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // kinder -> Nein
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // familienstand -> Verwitwet
  await page.locator('text=Verwitwet').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Verwitwet').click()

  // LStB
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('45000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('6200')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('9200')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Fast forward to Cockpit
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 13', { direction: 'Erstattung' })
  console.log('[Scenario 13] PASS: Widowed taxpayer interview and calculation verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 14: Michael & Sandra Keller (Married couple -> FilingTypeComparisonScreen)
// =================================================================================================
async function runScenario14_FilingTypeComparison(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparison) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(page, {
    email: 'du+michael.keller@beispiel.de',
    firstName: 'Michael',
    lastName: 'Keller',
    taxId: '89421035677',
  }, webOrigin)

  // Start interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Angestellt').click()

  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()

  // Verheiratet
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').click()

  // LStB
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('75000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('16000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('14000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Fast forward through catalogs to get to Veranlagungsartenvergleich
  // Catalog Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // Catalog Einkuenfte -> Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // Catalog Sonderausgaben: all Nein
  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // WorkdaysScreen -> 10 km one-way
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // PlausibilityScreen -> Weiter
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()

  // FilingTypeComparisonScreen!
  console.log('[Scenario 14] Entering FilingTypeComparisonScreen...')
  await page.locator('[data-testid="verheiratet-ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="verheiratet-ja"]').click()

  // Enter partner's taxable income zveB: 20.000 €
  const zveBInput = page.locator('[data-testid="zveb-input"]')
  await zveBInput.waitFor({ state: 'visible', timeout: 10_000 })
  await zveBInput.fill('20000')
  await zveBInput.blur()

  // Wait for calculation result card
  const resultText = page.locator('text=Zusammenveranlagung').first()
  await resultText.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 14] Live FilingTypeComparison calculation result verified.')

  // Continue to Cockpit
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await assertCockpitEstimate(page, 'Scenario 14', { direction: 'Erstattung' })
  console.log('[Scenario 14] PASS: Married couple FilingTypeComparison calculation verified.')

  await ctx.close()
}

// =================================================================================================
// MAIN RUNNER
// =================================================================================================
async function main() {
  console.log('================================================================================')
  console.log('STARTING ARCHETYPES & EDGE CASES END-TO-END QA ACCEPTANCE RUN')
  console.log('================================================================================')

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario9_Freelancer(browser, stack.webOrigin, stack.sql)
    await runScenario10_HybridBeides(browser, stack.webOrigin, stack.sql)
    await runScenario11_PrivatePension(browser, stack.webOrigin, stack.sql)
    await runScenario12_ExpatNonSwiss(browser, stack.webOrigin, stack.sql)
    await runScenario13_Widowed(browser, stack.webOrigin, stack.sql)
    await runScenario14_FilingTypeComparison(browser, stack.webOrigin, stack.sql)

    console.log('\n================================================================================')
    console.log('ALL ARCHETYPE & EDGE-CASE SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!')
    console.log('================================================================================\n')
  } catch (error) {
    fail(`Archetypes QA acceptance test failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    await stack.stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
