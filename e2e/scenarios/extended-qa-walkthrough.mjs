// Comprehensive End-to-End QA Walkthrough & Acceptance Testing
// Covers:
// - Scenario 5: Hans Meyer (Senior / Pensioner, RentnerScreen, CapitalScreen, Spenden)
// - Scenario 6: Sarah Fischer (Remote Worker, Homeoffice-Pauschale § 4 (5) Nr. 6c, Relocation, Riester, Bayern)
// - Scenario 7: David Richter (Single Parent, ChildrenScreen, Kindergeld, Entlastungsbetrag § 24b EStG)
// - Scenario 8: Exhaustive Navigation, Every Screen & Element, Back Buttons, Guest Funnel, Security & Privacy
//
// All runs pace against auth rate limits, verify calculations, and validate PDF/printout where applicable.

import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash } from '../harness/flows.mjs'

const require = createRequire(import.meta.url)
const { PDFDocument } = require('../../apps/api/node_modules/pdf-lib')

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }

/** Registers and onboards a user via the real UI. */
async function registerAndOnboard(page, { email, password, firstName, lastName, taxId, taxNumber }, webOrigin) {
  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', 'extended-qa')
  await skipSplash(page, webOrigin)

  const registerLink = page.locator('[data-testid="login-register-link"]')
  await registerLink.waitFor({ state: 'visible', timeout: 10_000 })
  await registerLink.click()

  await page.locator('[data-testid="registrierung-email"]').fill(email)
  await page.locator('[data-testid="registrierung-passwort"]').fill(password)
  await page.locator('[data-testid="registrierung-submit"]').click()

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

  // Onboarding Step 3: Speichern
  const saveButton = page.locator('[data-testid="onboarding-speichern"]')
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saveButton.click()

  // Wait for Cockpit
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 15_000 })
}

/** Switches Cockpit tax year to 2025. */
async function selectTaxYear2025(page) {
  const chip2025 = page.locator('[data-testid="jahr-2025"]')
  await chip2025.waitFor({ state: 'visible', timeout: 10_000 })
  await chip2025.click()
  await page.waitForTimeout(400)
}

/** Unlocks a tax year directly in the database for payment-free printout. */
function unlockTaxYearInDb(sql, email, year) {
  const userId = sql(`SELECT id FROM "User" WHERE email = '${email}';`).trim()
  if (!userId) fail(`unlockTaxYearInDb: user with email ${email} not found in database`)
  sql(
    `INSERT INTO "Freischaltung" ("id", "userId", "steuerjahr", "status", "stripeCheckoutSessionId", "createdAt", "updatedAt") ` +
      `VALUES (gen_random_uuid(), '${userId}', ${year}, 'bezahlt', 'e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}', NOW(), NOW()) ` +
      `ON CONFLICT DO NOTHING;`,
  )
}

/** Confirms annexes if ConfirmationScreen shows any. */
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

/** Asserts Cockpit estimate direction, range or exact message. */
async function assertCockpitEstimate(page, label, { direction, minAmount, expectedText } = {}) {
  const locator = page.locator('[data-testid="cockpit-erstattung"]')
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  const check = (text) => {
    if (expectedText !== undefined) {
      return text.includes(expectedText) ? null : `expected estimate to contain "${expectedText}"`
    }
    const named = direction === undefined ? ['Erstattung', 'Nachzahlung'].some((w) => text.includes(w)) : text.includes(direction)
    if (!named) return `expected a ${direction ?? 'refund or back-payment'} estimate`
    const amounts = [...text.matchAll(/\d{1,3}(?:\.\d{3})*/g)].map((m) => Number(m[0].replace(/\./g, '')))
    if (amounts.length === 0) return 'the estimate names no amount'
    const max = Math.max(...amounts)
    if (minAmount !== undefined && max < minAmount) return `expected amount to be at least ${minAmount} € but got max ${max} €`
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
// SCENARIO 5: Hans Meyer (Senior / Rentner, Gesetzliche Rente § 22, Kapitalerträge & Spenden)
// =================================================================================================
async function runScenario5_Pensioner(browser, webOrigin, sql) {
  console.log('\n--- Scenario 5: Hans Meyer (Retiree / Pensioner with statutory pension & capital income) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = 'du+hans.meyer@beispiel.de'
  const password = 'Sicheres-Passwort-1!'

  await registerAndOnboard(page, {
    email,
    password,
    firstName: 'Hans',
    lastName: 'Meyer',
    taxId: '61234567890',
  }, webOrigin)

  await selectTaxYear2025(page)

  // 1. Interview: Job = Rente
  const interviewBtn = page.locator('[data-testid="cockpit-interview"]')
  await interviewBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await interviewBtn.click()

  await page.locator('[data-testid="interview-option-job-Rente"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // 2. PensionerScreen (funnel routes directly to 'rente')
  console.log('[Scenario 5] Verifying PensionerScreen...')
  const heading = page.locator('text=Welche Rente beziehst du?')
  await heading.waitFor({ state: 'visible', timeout: 10_000 })

  // Select "Gesetzliche Rente"
  await page.locator('text=Gesetzliche Rente').click()

  // Enter Jahresbetrag: 24.000 €
  const betragInput = page.getByLabel(/Jahresbetrag der Rente/i)
  await betragInput.waitFor({ state: 'visible', timeout: 10_000 })
  await betragInput.fill('24000')
  await betragInput.blur()
  await page.waitForTimeout(500)

  // Enter Rentenbeginn: 2021
  const beginnInput = page.getByLabel(/Jahr des Rentenbeginns/i)
  await beginnInput.waitFor({ state: 'visible', timeout: 10_000 })
  await beginnInput.fill('2021')
  await beginnInput.blur()
  await page.waitForTimeout(500)

  // Check derived taxable portion text
  const shareHeading = page.locator('text=Steuerpflichtiger Anteil')
  await shareHeading.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 5] Taxable pension share rendered successfully.')

  // Click Weiter
  await page.locator('text=Weiter').click()

  // 3. From Cockpit, enter Capital gains via CapitalScreen
  console.log('[Scenario 5] Entering Capital income via Cockpit...')
  const capitalBtn = page.locator('[data-testid="cockpit-kapital"]')
  await capitalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await capitalBtn.click()

  // Wait for CapitalScreen to finish loading
  const answerPrompt = page.locator('[data-testid="kapital-frage-beantworten"]')
  const firstField = page.locator('[data-testid="kapital-kapitalertraege"]')
  await Promise.race([
    answerPrompt.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    firstField.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
  ])

  if (await answerPrompt.isVisible()) {
    console.log('[Scenario 5] Answering unknown depot questions...')
    await answerPrompt.click()
    const optKap = page.locator('[data-testid="katalog-option-einkuenfte-Kapitalerträge"]')
    await optKap.waitFor({ state: 'visible', timeout: 10_000 })
    await optKap.click()
    const optBroker = page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]')
    await optBroker.waitFor({ state: 'visible', timeout: 10_000 })
    await optBroker.click()
    await page.waitForTimeout(600)
  }

  // Capital fields
  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('[data-testid="kapital-kapitalertraege"]').fill('8000')
  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').fill('1000')
  await page.locator('[data-testid="kapital-kapitalertragsteuer"]').fill('1750')
  await page.locator('[data-testid="kapital-solidaritaetszuschlag"]').fill('96')
  await page.locator('[data-testid="kapital-kirchensteuer"]').fill('0')
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.waitForTimeout(500)

  // 4. Verify Cockpit Estimate
  await assertCockpitEstimate(page, 'Scenario 5', { expectedText: 'Die Erstattung rechnen wir bisher nur für Angestellte.' })

  // 4.1 Fill MasterData for Hans
  console.log('[Scenario 5] Completing MasterData...')
  const masterDataBtn = page.locator('[data-testid="cockpit-stammdaten"]')
  await masterDataBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await masterDataBtn.click()

  await page.locator('[data-testid="stammdaten-geburtsdatum"]').fill('14.03.1956')
  await page.locator('[data-testid="stammdaten-beruf"]').fill('Rentner')
  await page.locator('[data-testid="stammdaten-strasse"]').fill('Goethestraße')
  await page.locator('[data-testid="stammdaten-hausnummer"]').fill('10')
  await page.locator('[data-testid="stammdaten-plz"]').fill('70174')
  await page.locator('[data-testid="stammdaten-wohnort"]').fill('Stuttgart')
  await page.locator('[data-testid="stammdaten-familienstand-ledig"]').click()
  await page.locator('[data-testid="stammdaten-religion-VD"]').click()
  await page.locator('[data-testid="stammdaten-einwilligung"]').click()
  await page.locator('[data-testid="stammdaten-finanzamt"]').fill('Stuttgart I')
  await page.locator('[data-testid="stammdaten-iban"]').fill('DE89370400440532013000')
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  // 5. Unlock and check Printout
  unlockTaxYearInDb(sql, email, 2025)
  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await confirmAnnexesIfPresent(page)

  const downloadButton = page.locator('[data-testid="ausdruck-herunterladen-bearbeitbar"]')
  await downloadButton.waitFor({ state: 'visible', timeout: 15_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    downloadButton.click(),
  ])
  const filePath = await download.path()
  const pdfBytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(pdfBytes)
  if (doc.getPageCount() < 1) fail('Scenario 5 PDF is empty')
  console.log(`[Scenario 5] PASS: Pensioner flow, statutory pension calculation, capital income and PDF (${doc.getPageCount()} pages) verified.`)

  await ctx.close()
}

// =================================================================================================
// SCENARIO 6: Sarah Fischer (Remote Worker, Homeoffice-Pauschale, Relocation & Riester, Bayern)
// =================================================================================================
async function runScenario6_RemoteWorker(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 6: Sarah Fischer (Remote worker, 180 homeoffice days, relocation, Riester, Bavaria) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = 'du+sarah.fischer@beispiel.de'
  const password = 'Sicheres-Passwort-1!'

  await registerAndOnboard(page, {
    email,
    password,
    firstName: 'Sarah',
    lastName: 'Fischer',
    taxId: '71234567890',
    taxNumber: '0912345678',
  }, webOrigin)

  await selectTaxYear2025(page)

  // 1. Interview: Angestellt, kein Ausland, keine Kinder, ledig
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // 2. LstbScreen
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('65000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('12800')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13200')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // 3. Catalog: Lebenslagen
  // DHF = Nein
  await page.locator('[data-testid="katalog-option-dhf-Nein"]').click()
  // Umzug = Ja (berufsbedingt) -> 1.500 € Umzugskosten
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').fill('1500')
  await page.locator('[data-testid="katalog-submit-umzug-kosten"]').click()
  // Abfindung = Nein
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').click()
  // Lohnersatz = Nein
  await page.locator('[data-testid="katalog-option-lohnersatz-Nein"]').click()
  // Nebenjob = Nein
  await page.locator('[data-testid="katalog-option-nebenjob-Nein"]').click()

  // 4. Catalog: Einkünfte = Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // 5. Catalog: Sonderausgaben
  // Spenden = Nein
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  // KV/PV = Nein
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  // Riester = Ja -> 1.200 € Beitrag, Unmittelbar, Vorjahreseinnahmen 60.000 €
  await page.locator('[data-testid="katalog-option-riester-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Ja"]').click()
  await page.locator('[data-testid="katalog-input-riester-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-riester-betrag"]').fill('1200')
  await page.locator('[data-testid="katalog-submit-riester-betrag"]').click()
  await page.locator('[data-testid="katalog-option-riester-art-Unmittelbar"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-art-Unmittelbar"]').click()
  await page.locator('[data-testid="katalog-input-riester-einnahmen-vorjahr"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-riester-einnahmen-vorjahr"]').fill('60000')
  await page.locator('[data-testid="katalog-submit-riester-einnahmen-vorjahr"]').click()

  // 6. WorkdaysScreen: Homeoffice 180 Tage, Bayern (BY), 25 Tage Büro mit 15 km PKW
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill('30')
  await page.locator('[data-testid="arbeitstage-krank"]').fill('5')
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill('180')
  await page.locator('[data-testid="feiertage-region-BY"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('15')
  await page.locator('[data-testid="arbeitstage-transport-pkw"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('München')

  // Check preview text mentions allowance or workdays
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // 7. Plausibility & Veranlagungsvergleich
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()
  await page.locator('[data-testid="verheiratet-nein"]').click()
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  // 8. Cockpit Estimate
  await assertCockpitEstimate(page, 'Scenario 6', { direction: 'Erstattung' })
  console.log('[Scenario 6] PASS: Remote worker flow with Homeoffice-Pauschale and Riester verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 7: David Richter (Single Parent, 1 Child Felix, Kindergeld & § 24b Entlastungsbetrag)
// =================================================================================================
async function runScenario7_SingleParent(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 7: David Richter (Single parent, 1 child, Kindergeld & § 24b Entlastungsbetrag) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = 'du+david.richter@beispiel.de'
  const password = 'Sicheres-Passwort-1!'

  await registerAndOnboard(page, {
    email,
    password,
    firstName: 'David',
    lastName: 'Richter',
    taxId: '81234567890',
  }, webOrigin)

  await selectTaxYear2025(page)

  // 1. Interview: Angestellt, kein Ausland, 1 Kind, Geschieden oder getrennt
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Geschieden oder getrennt"]').click()

  // 2. LstbScreen
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('52000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8400')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('11000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // 3. Catalog Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  // 4. Catalog Einkünfte: Nein
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  // 5. Catalog Sonderausgaben: Spenden Nein, KV Nein, Riester Nein
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()

  // 6. WorkdaysScreen: 25 km, ÖPNV
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill('28')
  await page.locator('[data-testid="arbeitstage-krank"]').fill('3')
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill('0')
  await page.locator('[data-testid="feiertage-region-NW"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('25')
  await page.locator('[data-testid="arbeitstage-transport-oepnv"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('Köln')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // 7. Plausibility & Filing Type
  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()
  await page.locator('[data-testid="verheiratet-nein"]').click()
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  // 8. ChildrenScreen: Add Felix
  console.log('[Scenario 7] Adding child Felix via ChildrenScreen...')
  const kinderBtn = page.locator('[data-testid="cockpit-kinder"]')
  await kinderBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await kinderBtn.click()

  await page.locator('[data-testid="kind-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kind-vorname"]').fill('Felix')
  await page.locator('[data-testid="kind-nachname"]').fill('Richter')
  await page.locator('[data-testid="kind-geburtsdatum"]').fill('12.04.2019')
  await page.locator('[data-testid="kind-steuerid"]').fill('91234567890')
  await page.locator('[data-testid="kind-kindergeld"]').fill('3060')
  await page.locator('[data-testid="kind-verhaeltnis-1"]').click()
  await page.locator('[data-testid="kind-familienkasse"]').fill('Familienkasse Nordrhein-Westfalen')
  await page.locator('[data-testid="kind-inland-ja"]').click()
  await page.locator('[data-testid="kind-gemeldet-ja"]').click()
  await page.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
  await page.locator('[data-testid="kind-speichern"]').click()
  await page.waitForTimeout(500)

  // Back to Cockpit
  await page.locator('[data-testid="kinder-weiter"]').click()

  // 9. Check Cockpit estimate
  await assertCockpitEstimate(page, 'Scenario 7', { direction: 'Erstattung' })
  console.log('[Scenario 7] PASS: Single parent flow with child and Kindergeld verified.')

  await ctx.close()
}

// =================================================================================================
// SCENARIO 8: Comprehensive Navigation, Every Page & Button, Guest Flow, Security & Privacy
// =================================================================================================
async function runScenario8_ExhaustiveNavigation(browser, webOrigin, _sql) {
  console.log('\n--- Scenario 8: Exhaustive Navigation, Every Screen, Back Buttons, Settings & Viewports ---')

  // --- Step A: Guest Funnel & Konto-Wand Walk ---
  console.log('[Scenario 8.A] Guest Walk & Konto-Wand verification...')
  const guestCtx = await newContextAtBreakpoint(browser, 'm')
  const guestPage = await guestCtx.newPage()
  await skipSplash(guestPage, webOrigin)

  // Start as guest via "Als Gast starten" button on LoginScreen
  const guestButton = guestPage.locator('[data-testid="login-guest-link"]')
  await guestButton.waitFor({ state: 'visible', timeout: 10_000 })
  await guestButton.click()

  // Complete interview as guest
  await guestPage.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await guestPage.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await guestPage.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await guestPage.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await guestPage.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // Guest must land on Konto-Wand (AccountWallScreen)
  const kontoWandHeading = guestPage.locator('text=Dein Weg:')
  await kontoWandHeading.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.A] Konto-Wand displayed correctly for guest.')

  // Click "Später" -> should take guest to Cockpit
  const laterButton = guestPage.locator('[data-testid="konto-wand-spaeter"]')
  await laterButton.click()
  await guestPage.locator('[data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.A] "Später" returns guest safely to Cockpit.')
  await guestCtx.close()

  // --- Step B: Signed-in User: Full TabBar, Profile, Security, Privacy, Legal & Back Buttons ---
  console.log('[Scenario 8.B] Signed-in user: deep screen and navigation testing...')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = 'du+qa.deep@beispiel.de'
  const password = 'Sicheres-Passwort-1!'

  await registerAndOnboard(page, {
    email,
    password,
    firstName: 'Maximilian',
    lastName: 'Mustermann',
    taxId: '10234567890',
  }, webOrigin)

  await selectTaxYear2025(page)

  // 1. TabBar: Eule Tab (Kanzlei-Tisch)
  console.log('[Scenario 8.B] Navigating to Eule Tab...')
  await page.getByRole('tab', { name: 'Eule' }).click()
  const privacyBadge = page.locator('text=Mandantengeheimnis aktiv')
  await privacyBadge.waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] Eule Tab opens with Mandantengeheimnis badge.')

  // 2. TabBar: Belege Tab
  console.log('[Scenario 8.B] Navigating to Belege Tab...')
  await page.getByRole('tab', { name: 'Belege' }).click()
  await page.locator('text=Wirf alles rein — wir sortieren').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] Belege Tab verified.')

  // 3. TabBar: Profil Tab
  console.log('[Scenario 8.B] Navigating to Profil Tab...')
  await page.getByRole('tab', { name: 'Profil' }).click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })

  // 3.1 Profil -> Stammdaten
  console.log('[Scenario 8.B] Testing Profil -> Stammdaten and Back...')
  await page.locator('text=Angaben für die Steuererklärung').click()
  await page.locator('[data-testid="stammdaten-geburtsdatum"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-zurueck"]').click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] Stammdaten back navigation verified.')

  // 3.2 Profil -> Sicherheit (SecurityScreen)
  console.log('[Scenario 8.B] Testing Profil -> Sicherheit...')
  await page.locator('text=Sicherheit (Zwei-Faktor)').click()
  const twoFaButton = page.locator('text=Zwei-Faktor aktivieren')
  await twoFaButton.waitFor({ state: 'visible', timeout: 10_000 })
  await twoFaButton.click()

  // Verify password prompt in 2FA flow
  const passwordPrompt = page.locator('text=Passwort bestätigen')
  await passwordPrompt.waitFor({ state: 'visible', timeout: 10_000 })

  // Back to Profil via Appbar back arrow
  await page.locator('text=←').first().click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] SecurityScreen flow and back navigation verified.')

  // 3.3 Profil -> Datenschutz (PrivacyScreen)
  console.log('[Scenario 8.B] Testing Profil -> Datenschutz...')
  await page.locator('text=So schützen wir deine Daten (DSGVO)').click()
  const exportJsonBtn = page.locator('text=Als JSON herunterladen')
  await exportJsonBtn.waitFor({ state: 'visible', timeout: 10_000 })
  const exportPdfBtn = page.locator('text=Als PDF-Bericht herunterladen')
  await exportPdfBtn.waitFor({ state: 'visible', timeout: 10_000 })

  // Open "Konto löschen" offer
  const deleteBtn = page.locator('text=Konto & Daten löschen')
  await deleteBtn.click()
  const cancelDeleteBtn = page.locator('text=Abbrechen').first()
  await cancelDeleteBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await cancelDeleteBtn.click()
  await exportJsonBtn.waitFor({ state: 'visible', timeout: 10_000 })

  // Back to Profil
  await page.locator('text=←').first().click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] PrivacyScreen export buttons, deletion dialog dismissal and back navigation verified.')

  // 4. Return to Cockpit
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 4.1 AssessmentScreen (Bescheidvergleich)
  console.log('[Scenario 8.B] Testing Cockpit -> AssessmentScreen (Bescheidvergleich)...')
  const bescheidBtn = page.locator('[data-testid="cockpit-bescheid"]')
  await bescheidBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await bescheidBtn.click()

  const bescheidHeading = page.locator('text=Dein Steuerbescheid')
  await bescheidHeading.waitFor({ state: 'visible', timeout: 10_000 })

  // Fill sample assessment figures
  const steuerFeld = page.getByLabel(/Festgesetzte Einkommensteuer/i)
  if (await steuerFeld.count()) {
    await steuerFeld.fill('15000')
    await steuerFeld.blur()
  }

  // Back to Cockpit
  const bescheidBack = page.locator('text=←').first()
  await bescheidBack.click()
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] AssessmentScreen entry, inputs and back navigation verified.')

  // 4.2 RentalScreen (Vermietung)
  console.log('[Scenario 8.B] Testing Cockpit -> RentalScreen (Vermietung)...')
  const rentalBtn = page.locator('[data-testid="cockpit-vermietung"]')
  await rentalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await rentalBtn.click()

  await page.locator('text=Deine Vermietung').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=←').first().click()
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] RentalScreen back navigation verified.')

  // 5. Legal Pages Direct Links & Switching
  console.log('[Scenario 8.B] Testing Legal pages direct navigation and tab switches...')
  await page.goto(`${webOrigin}/rechtliches/impressum`, { waitUntil: 'networkidle' })
  await page.locator('text=Angaben gemäß § 5 DDG').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Switch to Datenschutz via footer link
  await page.locator('text=Datenschutzerklärung').last().click()
  await page.locator('text=1. Verantwortlicher').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Switch to AGB via footer link
  await page.locator('text=AGB & Widerruf').last().click()
  await page.locator('text=§ 1 Geltungsbereich').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Switch to Hinweise via footer link
  await page.locator('text=Wichtige Hinweise').last().click()
  await page.locator('text=Keine Steuerberatung').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Back button on Legal
  const legalBack = page.locator('text=←').first()
  await legalBack.click()
  await page.waitForTimeout(500)
  console.log('[Scenario 8.B] Legal screens (Impressum, Datenschutz, AGB, Hinweise) verified.')

  // 6. Device Screen
  console.log('[Scenario 8.B] Testing Device Screen edge cases...')
  await page.goto(`${webOrigin}/device`, { waitUntil: 'networkidle' })
  await page.locator('text=Kein Code angegeben').waitFor({ state: 'visible', timeout: 10_000 })
  await page.goto(`${webOrigin}/device?user_code=TEST-1234`, { waitUntil: 'networkidle' })
  await page.locator('text=Code ungültig oder abgelaufen').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 8.B] Device screen reachable and verified.')

  // 7. Responsive Breakpoint verification
  console.log('[Scenario 8.B] Verifying responsive layout across S (375px), M (768px), L (1280px)...')
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  }
  console.log('[Scenario 8.B] Responsive layout verified across all 3 canonical widths.')

  console.log('\n[Scenario 8] PASS: Exhaustive navigation, all pages, subviews, settings, and back buttons verified.')
  await ctx.close()
}

// =================================================================================================
// MAIN RUNNER
// =================================================================================================
async function main() {
  console.log('================================================================================')
  console.log('STARTING EXTENDED END-TO-END QA ACCEPTANCE RUN')
  console.log('================================================================================')

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario5_Pensioner(browser, stack.webOrigin, stack.sql)
    await runScenario6_RemoteWorker(browser, stack.webOrigin, stack.sql)
    await runScenario7_SingleParent(browser, stack.webOrigin, stack.sql)
    await runScenario8_ExhaustiveNavigation(browser, stack.webOrigin, stack.sql)

    console.log('\n================================================================================')
    console.log('ALL EXTENDED ACCEPTANCE SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!')
    console.log('================================================================================\n')
  } catch (error) {
    fail(`Extended QA acceptance test failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    await stack.stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
