// Acceptance gate: drives all 4 personas (Lena Hoffmann, Markus Brenner, Julia Brenner,
// Thomas & Sabine Weber) end-to-end through the real UI at every PR.
//
// Pipeline: Registration -> Interview -> Form masks -> Cockpit estimate -> Printout check.
// Target values and calculations are loaded from `../fixtures/scenarios-2025.fixture.mjs`.

import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash } from '../harness/flows.mjs'
import {
  SCENARIO_1_LENA,
  SCENARIO_2_3_BRENNER,
  SCENARIO_4_WEBER,
} from '../fixtures/scenarios-2025.fixture.mjs'

const require = createRequire(import.meta.url)
const { PDFDocument } = require('../../apps/api/node_modules/pdf-lib')

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }

/** Registers a new user account through RegistrationScreen, then completes OnboardingScreen. */
async function registerAndOnboard(page, { email, password, firstName, lastName, taxId, taxNumber }, webOrigin) {
  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', 'four-scenarios')
  await skipSplash(page, webOrigin)

  // Navigate to RegistrationScreen from LoginScreen
  const registerLink = page.locator('[data-testid="login-register-link"]')
  await registerLink.waitFor({ state: 'visible', timeout: 10_000 })
  await registerLink.click()

  // Registration form
  await page.locator('[data-testid="registrierung-email"]').fill(email)
  await page.locator('[data-testid="registrierung-passwort"]').fill(password)
  await page.locator('[data-testid="registrierung-submit"]').click()

  // Registration success screen
  const continueButton = page.locator('[data-testid="registrierung-success-weiter"]')
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
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

  // Onboarding Step 3: Summary save
  const saveButton = page.locator('[data-testid="onboarding-speichern"]')
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saveButton.click()

  // Wait for Cockpit to load
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 15_000 })
}

/** Switches the Cockpit tax year to 2025. */
async function selectTaxYear2025(page) {
  const chip2025 = page.locator('[data-testid="jahr-2025"]')
  await chip2025.waitFor({ state: 'visible', timeout: 10_000 })
  await chip2025.click()
  await page.waitForTimeout(400)
}

/** Unlocks a tax year directly in the database for payment-free e2e printout access. */
function unlockTaxYearInDb(sql, email, year) {
  const userId = sql(`SELECT id FROM "User" WHERE email = '${email}';`).trim()
  if (!userId) fail(`unlockTaxYearInDb: user with email ${email} not found in database`)
  sql(
    `INSERT INTO "Freischaltung" ("id", "userId", "steuerjahr", "status", "stripeCheckoutSessionId", "createdAt", "updatedAt") ` +
      `VALUES (gen_random_uuid(), '${userId}', ${year}, 'bezahlt', 'e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}', NOW(), NOW()) ` +
      `ON CONFLICT DO NOTHING;`,
  )
}

/** Confirms all unconfirmed annexes on ConfirmationScreen if any are pending. */
async function confirmAnnexesIfPresent(page) {
  const openConfirmButton = page.locator('[data-testid="ausdruck-bestaetigung-oeffnen"]')
  if ((await openConfirmButton.count()) > 0 && (await openConfirmButton.isVisible())) {
    await openConfirmButton.click()
    await page.locator('[data-testid="bestaetigung-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

    while (true) {
      const confirmButton = page.locator('[data-testid^="bestaetige-"]').first()
      if ((await confirmButton.count()) === 0 || !(await confirmButton.isVisible())) break
      await confirmButton.click()
      await page.waitForTimeout(400)
    }

    await page.locator('[data-testid="bestaetigung-zurueck"]').click()
    await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  }
}

/** Downloads the editable PDF and verifies expected PDF form field values. */
async function downloadAndVerifyPdf(page, expectedFields) {
  const downloadButton = page.locator('[data-testid="ausdruck-herunterladen-bearbeitbar"]')
  await downloadButton.waitFor({ state: 'visible', timeout: 15_000 })
  const isDisabled = await downloadButton.isDisabled().catch(() => false)
  if (isDisabled) {
    const errorCard = await page.locator('[data-testid="screen-container"]').first().innerText().catch(() => '')
    fail(`downloadAndVerifyPdf: download button is disabled. Screen content:\n${errorCard}`)
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    downloadButton.click(),
  ])

  const filePath = await download.path()
  const pdfBytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(pdfBytes)
  const form = doc.getForm()

  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    let actualValue
    try {
      const field = form.getField(key)
      actualValue = typeof field.getText === 'function' ? (field.getText() ?? '') : field.isChecked?.() ? 'X' : ''
    } catch (error) {
      fail(`downloadAndVerifyPdf: missing PDF form field "${key}" — ${error.message}`)
    }
    if (actualValue !== expectedValue) {
      fail(`downloadAndVerifyPdf: field "${key}" expected "${expectedValue}" but got "${actualValue}"`)
    }
  }
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 1: Lena Hoffmann (Single DE Employee, Commute, Donations)
// -------------------------------------------------------------------------------------------------
async function runScenario1(browser, webOrigin, sql) {
  console.log('\n--- Scenario 1: Lena Hoffmann (single, DE employee, commute, donations) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const s1 = SCENARIO_1_LENA

  // 1. Registration & Onboarding
  await registerAndOnboard(page, {
    email: s1.email,
    password: s1.password,
    firstName: s1.profile.firstName,
    lastName: s1.profile.lastName,
    taxId: s1.profile.taxId,
    taxNumber: s1.profile.taxNumber,
  }, webOrigin)

  // 2. Select Tax Year 2025
  await selectTaxYear2025(page)

  // 3. Minimal Gate Interview
  const interviewBtn = page.locator('[data-testid="cockpit-interview"]')
  await interviewBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await interviewBtn.click()

  await page.locator(`[data-testid="interview-option-job-${s1.interview.job}"]`).click()
  await page.locator(`[data-testid="interview-option-ausland-${s1.interview.ausland}"]`).click()
  await page.locator(`[data-testid="interview-option-kinder-${s1.interview.kinder}"]`).click()
  await page.locator(`[data-testid="interview-option-familienstand-${s1.interview.familienstand}"]`).click()

  // 4. LstbScreen
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s1.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s1.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s1.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()

  // 5. CatalogScreen: Lebenslagen (answer "Nein" to all 5 questions)
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // 6. CatalogScreen: Einkünfte
  const einkuenfteNein = page.locator('[data-testid="katalog-option-einkuenfte-Nein"]')
  await einkuenfteNein.waitFor({ state: 'visible', timeout: 10_000 })
  await einkuenfteNein.click()

  // 7. CatalogScreen: Sonderausgaben
  // Spenden: Ja -> 300
  await page.locator('[data-testid="katalog-option-spenden-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Ja"]').click()
  await page.locator('[data-testid="katalog-input-spenden-betrag"]').fill(String(s1.specialExpenses.donations))
  await page.locator('[data-testid="katalog-submit-spenden-betrag"]').click()

  // KV/PV: Nein
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()

  // Riester: Nein
  await page.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()

  // 8. WorkdaysScreen
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s1.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s1.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s1.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s1.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s1.commute.oneWayKm))
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s1.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // 9. PlausibilityScreen -> FilingTypeComparisonScreen -> Cockpit
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()

  await page.locator('[data-testid="verheiratet-nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="verheiratet-nein"]').click()
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  // 10. MasterDataScreen
  await page.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-stammdaten"]').click()

  await page.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s1.masterData.birthDate)
  await page.locator('[data-testid="stammdaten-beruf"]').fill(s1.masterData.occupation)
  await page.locator('[data-testid="stammdaten-strasse"]').fill(s1.masterData.street)
  await page.locator('[data-testid="stammdaten-hausnummer"]').fill(s1.masterData.houseNumber)
  await page.locator('[data-testid="stammdaten-plz"]').fill(s1.masterData.postalCode)
  await page.locator('[data-testid="stammdaten-wohnort"]').fill(s1.masterData.city)
  await page.locator(`[data-testid="stammdaten-familienstand-${s1.masterData.maritalStatus}"]`).click()
  await page.locator(`[data-testid="stammdaten-religion-${s1.masterData.religion}"]`).click()
  await page.locator('[data-testid="stammdaten-einwilligung"]').click()
  await page.locator('[data-testid="stammdaten-finanzamt"]').fill(s1.masterData.taxOffice)
  await page.locator('[data-testid="stammdaten-iban"]').fill(s1.masterData.iban)

  // Save master data and navigate back to Cockpit
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  // 11. Check Cockpit estimate
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  const estimateText = await page.locator('[data-testid="cockpit-erstattung"]').innerText()
  console.log(`[Scenario 1] Cockpit estimate text: "${estimateText}"`)
  if (!estimateText.includes('Erstattung')) {
    fail(`[Scenario 1] expected refund estimate text, got: "${estimateText}"`)
  }

  // 12. Unlock year in DB & Printout check
  unlockTaxYearInDb(sql, s1.email, s1.year)

  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(page)
  await downloadAndVerifyPdf(page, s1.expectedPdfFields)
  console.log('[Scenario 1] PASS: Registration, interview, LStB, commute, estimate and PDF printout verified.')

  await ctx.close()
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 2 & 3: Markus Brenner & Julia Brenner (Swiss Grenzgänger Couple, Children)
// -------------------------------------------------------------------------------------------------
async function runScenario2And3(browser, webOrigin, sql) {
  console.log('\n--- Scenario 2 & 3: Markus & Julia Brenner (Swiss cross-border, married, 2 children) ---')
  const ctxMarkus = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const pageMarkus = await ctxMarkus.newPage()
  guardAgainst429(pageMarkus, fail)

  const s = SCENARIO_2_3_BRENNER

  // --- Step A: Markus registers and enters Swiss salary statement ---
  await registerAndOnboard(pageMarkus, {
    email: s.markus.email,
    password: s.markus.password,
    firstName: s.markus.profile.firstName,
    lastName: s.markus.profile.lastName,
    taxId: s.markus.profile.taxId,
    taxNumber: s.markus.profile.taxNumber,
  }, webOrigin)

  await selectTaxYear2025(pageMarkus)

  // Minimal Gate Interview
  await pageMarkus.locator('[data-testid="cockpit-interview"]').click()
  await pageMarkus.locator(`[data-testid="interview-option-job-${s.markus.interview.job}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-ausland-${s.markus.interview.ausland}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-kinder-${s.markus.interview.kinder}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-familienstand-${s.markus.interview.familienstand}"]`).click()

  // CrossBorderScreen: Nichtrückkehrtage
  await pageMarkus.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="ch-tage-input"]').fill(String(s.markus.crossBorder.nonReturnDays))
  await pageMarkus.locator('[data-testid="ch-tage-weiter"]').click()

  // CrossBorderScreen: Lohnausweis values
  await pageMarkus.locator('[data-testid="ch-feld-lohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="ch-feld-lohn"]').fill(String(s.markus.crossBorder.wageChf))
  await pageMarkus.locator('[data-testid="ch-feld-andere-leistungen"]').fill(String(s.markus.crossBorder.familyAllowancesChf))
  await pageMarkus.locator('[data-testid="ch-feld-bruttolohn-total"]').fill(String(s.markus.crossBorder.grossWageChf))
  await pageMarkus.locator('[data-testid="ch-feld-ahv-beitraege"]').fill(String(s.markus.crossBorder.ahvAlvChf))
  await pageMarkus.locator('[data-testid="ch-feld-berufliche-vorsorge"]').fill(String(s.markus.crossBorder.pensionChf))
  await pageMarkus.locator('[data-testid="ch-feld-nettolohn"]').fill(String(s.markus.crossBorder.netWageChf))
  await pageMarkus.locator('[data-testid="ch-feld-quellensteuer"]').fill(String(s.markus.crossBorder.withholdingTaxChf))

  // Exchange rate
  await pageMarkus.locator('[data-testid="ch-wechselkurs-monat"]').fill(s.markus.crossBorder.exchangeRateMonth)
  await pageMarkus.locator('[data-testid="ch-wechselkurs-kurs"]').fill(s.markus.crossBorder.exchangeRate)
  await pageMarkus.locator('[data-testid="ch-wechselkurs-speichern"]').click()

  // N-Gre details & Krankenversicherung
  await pageMarkus.locator('[data-testid="ch-ngre-krankentaggeldArbeitgeberProzent"]').fill(String(s.markus.crossBorder.dailySicknessEmployerPercent))
  await pageMarkus.locator('[data-testid="ch-ngre-sonderfaelle-nein"]').click()
  await pageMarkus.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').fill(String(s.markus.crossBorder.healthCareEur))

  await pageMarkus.locator('[data-testid="ch-lohnausweis-weiter"]').click()

  // Catalog Einkünfte: Nein
  await pageMarkus.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // Catalog Sonderausgaben: Spenden Nein, KV Nein, Riester Nein
  await pageMarkus.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await pageMarkus.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await pageMarkus.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-riester-Nein"]').click()

  // WorkdaysScreen for Markus
  await pageMarkus.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.markus.commute.vacationDays))
  await pageMarkus.locator('[data-testid="arbeitstage-krank"]').fill(String(s.markus.commute.sickDays))
  await pageMarkus.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.markus.commute.homeOfficeDays))
  await pageMarkus.locator(`[data-testid="feiertage-region-${s.markus.commute.region}"]`).click()
  await pageMarkus.locator('[data-testid="arbeitstage-km"]').fill(String(s.markus.commute.oneWayKm))
  await pageMarkus.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.markus.commute.workplace)
  await pageMarkus.locator('[data-testid="arbeitstage-weiter"]').click()

  // Add 2 Children via ChildrenScreen
  await pageMarkus.locator('[data-testid="cockpit-kinder"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="cockpit-kinder"]').click()

  for (const child of s.markus.children) {
    await pageMarkus.locator('[data-testid="kind-neu"]').waitFor({ state: 'visible', timeout: 10_000 })
    await pageMarkus.locator('[data-testid="kind-neu"]').click()
    await pageMarkus.locator('[data-testid="kind-vorname"]').fill(child.firstName)
    await pageMarkus.locator('[data-testid="kind-nachname"]').fill(child.lastName)
    await pageMarkus.locator('[data-testid="kind-geburtsdatum"]').fill(child.birthDate)
    await pageMarkus.locator('[data-testid="kind-steuerid"]').fill(child.taxId)
    await pageMarkus.locator('[data-testid="kind-schweizer-kinderzulage"]').fill(String(child.swissAllowanceEur))
    await pageMarkus.locator('[data-testid="kind-kindergeld"]').fill(String(child.childBenefitEur))
    await pageMarkus.locator('[data-testid="kind-verhaeltnis-1"]').click()
    await pageMarkus.locator('[data-testid="kind-verhaeltnis-b-1"]').click()
    await pageMarkus.locator('[data-testid="kind-inland-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-gemeldet-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-speichern"]').click()
    await pageMarkus.waitForTimeout(400)
  }

  await pageMarkus.locator('[data-testid="kinder-weiter"]').click()

  // MasterDataScreen for Markus: generate invitation code
  await pageMarkus.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="cockpit-stammdaten"]').click()

  await pageMarkus.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.markus.masterData.birthDate)
  await pageMarkus.locator('[data-testid="stammdaten-beruf"]').fill(s.markus.masterData.occupation)
  await pageMarkus.locator('[data-testid="stammdaten-strasse"]').fill(s.markus.masterData.street)
  await pageMarkus.locator('[data-testid="stammdaten-hausnummer"]').fill(s.markus.masterData.houseNumber)
  await pageMarkus.locator('[data-testid="stammdaten-plz"]').fill(s.markus.masterData.postalCode)
  await pageMarkus.locator('[data-testid="stammdaten-wohnort"]').fill(s.markus.masterData.city)
  await pageMarkus.locator(`[data-testid="stammdaten-familienstand-${s.markus.masterData.maritalStatus}"]`).click()
  await pageMarkus.locator(`[data-testid="stammdaten-religion-${s.markus.masterData.religion}"]`).click()
  await pageMarkus.locator('[data-testid="stammdaten-einwilligung"]').click()
  await pageMarkus.locator('[data-testid="stammdaten-finanzamt"]').fill(s.markus.masterData.taxOffice)
  await pageMarkus.locator('[data-testid="stammdaten-iban"]').fill(s.markus.masterData.iban)

  await pageMarkus.locator('[data-testid="kopplung-zusammen"]').click()
  await pageMarkus.locator('[data-testid="stammdaten-speichern"]').click()
  await pageMarkus.waitForTimeout(500)

  // Read invitation code from MasterDataScreen
  await pageMarkus.locator('[data-testid="kopplung-code-anzeige"]').waitFor({ state: 'visible', timeout: 10_000 })
  const codeNotice = await pageMarkus.locator('[data-testid="kopplung-code-anzeige"]').innerText()
  const match = codeNotice.match(/([0-9A-F]{16})/i)
  if (!match) fail(`could not extract 16-character invitation code from notice: "${codeNotice}"`)
  const invitationCode = match[1]
  console.log(`[Scenario 2/3] Generated invitation code for Julia: ${invitationCode}`)

  await pageMarkus.locator('[data-testid="stammdaten-zurueck"]').click()

  // --- Step B: Julia registers and joins the coupling via invitation code ---
  const ctxJulia = await newContextAtBreakpoint(browser, 'l')
  const pageJulia = await ctxJulia.newPage()
  guardAgainst429(pageJulia, fail)

  await registerAndOnboard(pageJulia, {
    email: s.julia.email,
    password: s.julia.password,
    firstName: s.julia.profile.firstName,
    lastName: s.julia.profile.lastName,
    taxId: s.julia.profile.taxId,
    taxNumber: s.julia.profile.taxNumber,
  }, webOrigin)

  await selectTaxYear2025(pageJulia)

  // Minimal Gate for Julia
  await pageJulia.locator('[data-testid="cockpit-interview"]').click()
  await pageJulia.locator(`[data-testid="interview-option-job-${s.julia.interview.job}"]`).click()
  await pageJulia.locator(`[data-testid="interview-option-ausland-${s.julia.interview.ausland}"]`).click()
  await pageJulia.locator(`[data-testid="interview-option-kinder-${s.julia.interview.kinder}"]`).click()
  await pageJulia.locator(`[data-testid="interview-option-familienstand-${s.julia.interview.familienstand}"]`).click()

  // CrossBorderScreen for Julia
  await pageJulia.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="ch-tage-input"]').fill(String(s.julia.crossBorder.nonReturnDays))
  await pageJulia.locator('[data-testid="ch-tage-weiter"]').click()

  await pageJulia.locator('[data-testid="ch-feld-lohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="ch-feld-lohn"]').fill(String(s.julia.crossBorder.wageChf))
  await pageJulia.locator('[data-testid="ch-feld-bruttolohn-total"]').fill(String(s.julia.crossBorder.wageChf))
  await pageJulia.locator('[data-testid="ch-feld-ahv-beitraege"]').fill(String(s.julia.crossBorder.ahvAlvChf))
  await pageJulia.locator('[data-testid="ch-feld-berufliche-vorsorge"]').fill(String(s.julia.crossBorder.pensionChf))
  await pageJulia.locator('[data-testid="ch-feld-nettolohn"]').fill(String(s.julia.crossBorder.netWageChf))
  await pageJulia.locator('[data-testid="ch-feld-quellensteuer"]').fill(String(s.julia.crossBorder.withholdingTaxChf))

  await pageJulia.locator('[data-testid="ch-wechselkurs-monat"]').fill(s.julia.crossBorder.exchangeRateMonth)
  await pageJulia.locator('[data-testid="ch-wechselkurs-kurs"]').fill(s.julia.crossBorder.exchangeRate)
  await pageJulia.locator('[data-testid="ch-wechselkurs-speichern"]').click()

  await pageJulia.locator('[data-testid="ch-ngre-sonderfaelle-nein"]').click()
  await pageJulia.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').fill(String(s.julia.crossBorder.healthCareEur))
  await pageJulia.locator('[data-testid="ch-lohnausweis-weiter"]').click()

  // Catalog Einkünfte / Sonderausgaben: Nein
  await pageJulia.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()
  await pageJulia.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await pageJulia.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await pageJulia.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="katalog-option-riester-Nein"]').click()

  // WorkdaysScreen for Julia
  await pageJulia.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.julia.commute.vacationDays))
  await pageJulia.locator('[data-testid="arbeitstage-krank"]').fill(String(s.julia.commute.sickDays))
  await pageJulia.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.julia.commute.homeOfficeDays))
  await pageJulia.locator(`[data-testid="feiertage-region-${s.julia.commute.region}"]`).click()
  await pageJulia.locator('[data-testid="arbeitstage-km"]').fill(String(s.julia.commute.oneWayKm))
  await pageJulia.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.julia.commute.workplace)
  await pageJulia.locator('[data-testid="arbeitstage-weiter"]').click()

  // Julia joins coupling in MasterDataScreen
  await pageJulia.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="cockpit-stammdaten"]').click()

  await pageJulia.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.julia.masterData.birthDate)
  await pageJulia.locator('[data-testid="stammdaten-beruf"]').fill(s.julia.masterData.occupation)
  await pageJulia.locator(`[data-testid="stammdaten-familienstand-${s.julia.masterData.maritalStatus}"]`).click()
  await pageJulia.locator(`[data-testid="stammdaten-religion-${s.julia.masterData.religion}"]`).click()
  await pageJulia.locator('[data-testid="stammdaten-einwilligung"]').click()

  await pageJulia.locator('[data-testid="kopplung-code"]').fill(invitationCode)
  await pageJulia.locator('[data-testid="kopplung-beitreten"]').click()
  await pageJulia.waitForTimeout(500)
  await pageJulia.locator('[data-testid="stammdaten-speichern"]').click()
  await ctxJulia.close()

  // --- Step C: Markus prints the joint return ---
  unlockTaxYearInDb(sql, s.markus.email, s.year)

  await pageMarkus.locator('[data-testid="cockpit-ausdruck"]').click()
  await pageMarkus.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(pageMarkus)
  await downloadAndVerifyPdf(pageMarkus, s.expectedPdfFields)
  console.log('[Scenario 2/3] PASS: Swiss Grenzgänger couple joint filing and PDF printout verified.')

  await ctxMarkus.close()
}

// -------------------------------------------------------------------------------------------------
// SCENARIO 4: Thomas & Sabine Weber (Married Couple DE, Rentals, Capital Income)
// -------------------------------------------------------------------------------------------------
async function runScenario4(browser, webOrigin, sql) {
  console.log('\n--- Scenario 4: Thomas & Sabine Weber (married DE, 3 rentals, 50k capital income) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const s = SCENARIO_4_WEBER

  // 1. Thomas registers & completes Onboarding
  await registerAndOnboard(page, {
    email: s.email,
    password: s.password,
    firstName: s.thomas.profile.firstName,
    lastName: s.thomas.profile.lastName,
    taxId: s.thomas.profile.taxId,
    taxNumber: s.thomas.profile.taxNumber,
  }, webOrigin)

  await selectTaxYear2025(page)

  // 2. Minimal Gate Interview
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator(`[data-testid="interview-option-job-${s.thomas.interview.job}"]`).click()
  await page.locator(`[data-testid="interview-option-ausland-${s.thomas.interview.ausland}"]`).click()
  await page.locator(`[data-testid="interview-option-kinder-${s.thomas.interview.kinder}"]`).click()
  await page.locator(`[data-testid="interview-option-familienstand-${s.thomas.interview.familienstand}"]`).click()

  // 3. LstbScreen for Thomas
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s.thomas.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s.thomas.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s.thomas.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()

  // 4. Catalog Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // 5. Catalog Einkünfte: Beides -> Deutscher Broker -> Mehrere
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').click()

  // 6. Catalog Sonderausgaben: all Nein
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()

  // 7. WorkdaysScreen for Thomas
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.thomas.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s.thomas.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.thomas.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s.thomas.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s.thomas.commute.oneWayKm))
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.thomas.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // Plausibility & Filing comparison
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()
  await page.locator('[data-testid="verheiratet-ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="verheiratet-ja"]').click()
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  // 8. MasterDataScreen for Thomas: enters Person B Sabine directly (no separate account)
  await page.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-stammdaten"]').click()

  await page.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.thomas.masterData.birthDate)
  await page.locator('[data-testid="stammdaten-beruf"]').fill(s.thomas.masterData.occupation)
  await page.locator('[data-testid="stammdaten-strasse"]').fill(s.thomas.masterData.street)
  await page.locator('[data-testid="stammdaten-hausnummer"]').fill(s.thomas.masterData.houseNumber)
  await page.locator('[data-testid="stammdaten-plz"]').fill(s.thomas.masterData.postalCode)
  await page.locator('[data-testid="stammdaten-wohnort"]').fill(s.thomas.masterData.city)
  await page.locator(`[data-testid="stammdaten-familienstand-${s.thomas.masterData.maritalStatus}"]`).click()
  await page.locator(`[data-testid="stammdaten-religion-${s.thomas.masterData.religion}"]`).click()
  await page.locator('[data-testid="stammdaten-einwilligung"]').click()
  await page.locator('[data-testid="stammdaten-finanzamt"]').fill(s.thomas.masterData.taxOffice)
  await page.locator('[data-testid="stammdaten-iban"]').fill(s.thomas.masterData.iban)

  // Person B details
  await page.locator('[data-testid="kopplung-zusammen"]').click()
  await page.locator('[data-testid="personb-vorname"]').fill(s.sabine.firstName)
  await page.locator('[data-testid="personb-nachname"]').fill(s.sabine.lastName)
  await page.locator('[data-testid="personb-steuerid"]').fill(s.sabine.taxId)
  await page.locator('[data-testid="personb-geburtsdatum"]').fill(s.sabine.birthDate)
  await page.locator('[data-testid="personb-beruf"]').fill(s.sabine.occupation)
  await page.locator('[data-testid="personb-speichern"]').click()
  await page.waitForTimeout(400)

  // Record Sabine's LStB via partner-lstb
  await page.locator('[data-testid="partner-lstb"]').click()
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s.sabine.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s.sabine.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s.sabine.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Record Sabine's commute via partner-arbeitsweg
  await page.locator('[data-testid="partner-arbeitsweg"]').click()
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.sabine.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s.sabine.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.sabine.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s.sabine.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s.sabine.commute.oneWayKm))
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.sabine.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // Save MasterData & return to Cockpit
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  // 9. CapitalScreen: Joint custody, 50k capital income
  await page.locator('[data-testid="cockpit-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kapital"]').click()

  await page.locator('[data-testid="kapital-inhaber-gemeinsam"]').click()
  await page.locator('[data-testid="kapital-kapitalertraege"]').fill(String(s.capital.kapitalertraege))
  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').fill(String(s.capital.sparerPauschbetrag))
  await page.locator('[data-testid="kapital-kapitalertragsteuer"]').fill(String(s.capital.kapitalertragsteuer))
  await page.locator('[data-testid="kapital-solidaritaetszuschlag"]').fill(String(s.capital.solidaritaetszuschlag))
  await page.locator('[data-testid="kapital-kirchensteuer"]').fill(String(s.capital.kirchensteuer))
  await page.locator('[data-testid="kapital-weiter"]').click()

  // 10. RentalScreen: 3 rental properties
  await page.locator('[data-testid="cockpit-vermietung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-vermietung"]').click()

  for (let i = 0; i < s.rentals.length; i++) {
    const r = s.rentals[i]
    if (i > 0) {
      await page.locator('[data-testid="objekt-hinzufuegen"]').click()
      await page.waitForTimeout(300)
    }
    await page.locator(`[data-testid="vermietung-${i}-einnahmen"]`).fill(String(r.grossRent))
    await page.locator(`[data-testid="vermietung-${i}-werbungskosten"]`).fill(String(r.advertisingCosts))
    await page.locator(`[data-testid="vermietung-${i}-anschaffungskostenGebaeude"]`).fill(String(r.buildingCost))
    await page.locator(`[data-testid="vermietung-${i}-baujahr"]`).fill(String(r.yearOfConstruction))
    await page.locator(`[data-testid="vermietung-${i}-adresse"]`).fill(r.address.street)
    await page.locator(`[data-testid="vermietung-${i}-plz"]`).fill(r.address.postalCode)
    await page.locator(`[data-testid="vermietung-${i}-ort"]`).fill(r.address.city)
    await page.locator(`[data-testid="vermietung-${i}-wohnflaeche"]`).fill(r.address.livingArea)
    await page.locator(`[data-testid="vermietung-${i}-einheiten"]`).fill(r.address.units)
    const afaBtn = i === 0
      ? page.locator('[data-testid="vermietung-afa-wie-vorjahr-ja"]')
      : page.locator(`[data-testid="vermietung-${i}-afa-wie-vorjahr-ja"]`)
    await afaBtn.click()
  }

  await page.locator('[data-testid="vermietung-weiter"]').click()

  // 11. Check Cockpit estimate
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  const estimateText = await page.locator('[data-testid="cockpit-erstattung"]').innerText()
  console.log(`[Scenario 4] Cockpit estimate text: "${estimateText}"`)

  // 12. Unlock year & Printout check
  unlockTaxYearInDb(sql, s.email, s.year)

  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(page)
  await downloadAndVerifyPdf(page, s.expectedPdfFields)
  console.log('[Scenario 4] PASS: Married couple DE, 3 rentals, 50k capital income and PDF printout verified.')

  await ctx.close()
}

// -------------------------------------------------------------------------------------------------
// Main acceptance runner: runs all 4 personas sequentially
// -------------------------------------------------------------------------------------------------
async function main() {
  console.log('[four-scenarios] Starting S10 full UI acceptance test (4 personas)...')
  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario1(browser, stack.webOrigin, stack.sql)
    await runScenario2And3(browser, stack.webOrigin, stack.sql)
    await runScenario4(browser, stack.webOrigin, stack.sql)

    console.log('\n============================================================')
    console.log('PASS: All 4 acceptance scenarios completed successfully via UI!')
    console.log('============================================================\n')
  } catch (error) {
    fail(`four-scenarios acceptance test failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    await stack.stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
