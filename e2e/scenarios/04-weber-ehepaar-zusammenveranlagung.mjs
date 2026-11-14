// Scenario 04: Thomas & Sabine Weber (Married Couple DE, Partner B inline masks, 3 Rentals, 50k Capital Income)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIO_4_WEBER } from '../fixtures/scenarios-2025.fixture.mjs'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  assertEstimate,
  unlockTaxYearInDb,
  confirmAnnexesIfPresent,
  downloadAndVerifyPdf,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario04(browser, webOrigin, sql) {
  console.log('\n--- Scenario 04: Thomas & Sabine Weber (married DE, 3 rentals, 50k capital income) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const s = SCENARIO_4_WEBER

  await registerAndOnboard(
    page,
    {
      email: s.email,
      password: s.password,
      firstName: s.thomas.profile.firstName,
      lastName: s.thomas.profile.lastName,
      taxId: s.thomas.profile.taxId,
      taxNumber: s.thomas.profile.taxNumber,
    },
    webOrigin,
    'scenario-04',
  )

  await selectTaxYear2025(page)

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator(`[data-testid="interview-option-job-${s.thomas.interview.job}"]`).click()
  await page.locator(`[data-testid="interview-option-ausland-${s.thomas.interview.ausland}"]`).click()
  await page.locator(`[data-testid="interview-option-kinder-${s.thomas.interview.kinder}"]`).click()
  await page.locator(`[data-testid="interview-option-familienstand-${s.thomas.interview.familienstand}"]`).click()
  // ADR-0088: the interview asks what Person B does
  await page.locator('[data-testid="interview-option-partner-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-partner-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-ausland-Nein"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s.thomas.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s.thomas.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s.thomas.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }
  await nextStep(page)

  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').click()
  await nextStep(page)

  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()
  await nextStep(page)

  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.thomas.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s.thomas.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.thomas.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s.thomas.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s.thomas.commute.oneWayKm))
  await page.locator(`[data-testid="arbeitstage-transport-${s.thomas.commute.transport}"]`).click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.thomas.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtnStep = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtnStep.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtnStep.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled before Stammdaten in Scenario 04')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

  await page.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-stammdaten"]').click()

  await page.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.thomas.masterData.birthDate)
  await page.locator('[data-testid="stammdaten-beruf"]').fill(s.thomas.masterData.occupation)
  await page.locator('[data-testid="stammdaten-strasse"]').fill(s.thomas.masterData.street)
  await page.locator('[data-testid="stammdaten-hausnummer"]').fill(s.thomas.masterData.houseNumber)
  await page.locator('[data-testid="stammdaten-plz"]').fill(s.thomas.masterData.postalCode)
  await page.locator('[data-testid="stammdaten-wohnort"]').fill(s.thomas.masterData.city)
  await page.locator(`[data-testid="stammdaten-familienstand-${s.thomas.masterData.maritalStatus}"]`).click()
  await page.locator('[data-testid="stammdaten-familienstandSeit"]').fill(s.thomas.masterData.marriedSince)
  await page.locator(`[data-testid="stammdaten-religion-${s.thomas.masterData.religion}"]`).click()
  await page.locator('[data-testid="stammdaten-einwilligung"]').click()
  await page.locator('[data-testid="stammdaten-finanzamt"]').fill(s.thomas.masterData.taxOffice)
  await page.locator('[data-testid="stammdaten-iban"]').fill(s.thomas.masterData.iban)

  await page.locator('[data-testid="kopplung-zusammen"]').click()
  await page.locator('[data-testid="personb-vorname"]').fill(s.sabine.firstName)
  await page.locator('[data-testid="personb-nachname"]').fill(s.sabine.lastName)
  await page.locator('[data-testid="personb-steuerid"]').fill(s.sabine.taxId)
  await page.locator('[data-testid="personb-geburtsdatum"]').fill(s.sabine.birthDate)
  await page.locator('[data-testid="personb-beruf"]').fill(s.sabine.occupation)
  await page.locator('[data-testid="personb-speichern"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(400)

  await page.locator('[data-testid="stammdaten-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  await page.locator('[data-testid="cockpit-bereich-du"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-bereich-partner"]', { hasText: s.sabine.firstName }).waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('[data-testid="partner-lstb"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-lstb"]').click()
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  if (page.url().includes(s.sabine.firstName)) {
    fail(`Partner name leaked into URL: ${page.url()}`)
  }
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s.sabine.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s.sabine.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s.sabine.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="partner-arbeitsweg"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-arbeitsweg"]').click()
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.sabine.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s.sabine.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.sabine.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s.sabine.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s.sabine.commute.oneWayKm))
  await page.locator(`[data-testid="arbeitstage-transport-${s.sabine.commute.transport}"]`).click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.sabine.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kapital"]').click()

  await page.locator('[data-testid="kapital-inhaber-gemeinsam"]').click()
  await page.locator('[data-testid="kapital-kapitalertraege"]').fill(String(s.capital.kapitalertraege))
  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').fill(String(s.capital.sparerPauschbetrag))
  await page.locator('[data-testid="kapital-kapitalertragsteuer"]').fill(String(s.capital.kapitalertragsteuer))
  await page.locator('[data-testid="kapital-solidaritaetszuschlag"]').fill(String(s.capital.solidaritaetszuschlag))
  await page.locator('[data-testid="kapital-kirchensteuer"]').fill(String(s.capital.kirchensteuer))
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-vermietung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-vermietung"]').click()

  for (let i = 0; i < s.rentals.length; i++) {
    const r = s.rentals[i]
    const mieteLocator = page.locator(`[data-testid="vermietung-${i}-mieteinnahmen"]`)
    if ((await mieteLocator.count()) === 0 || !(await mieteLocator.isVisible())) {
      await page.locator('[data-testid="objekt-hinzufuegen"]').click()
      await mieteLocator.waitFor({ state: 'visible', timeout: 10_000 })
    }
    await page.locator(`[data-testid="vermietung-${i}-mieteinnahmen"]`).fill(String(r.grossRent))
    await page.locator(`[data-testid="vermietung-${i}-mieteinnahmen"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-werbungskosten"]`).fill(String(r.advertisingCosts))
    await page.locator(`[data-testid="vermietung-${i}-werbungskosten"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-anschaffungskosten"]`).fill(String(r.buildingCost))
    await page.locator(`[data-testid="vermietung-${i}-anschaffungskosten"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-baujahr"]`).fill(String(r.yearOfConstruction))
    await page.locator(`[data-testid="vermietung-${i}-baujahr"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-adresse"]`).fill(r.address.street)
    await page.locator(`[data-testid="vermietung-${i}-adresse"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-plz"]`).fill(r.address.postalCode)
    await page.locator(`[data-testid="vermietung-${i}-plz"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-ort"]`).fill(r.address.city)
    await page.locator(`[data-testid="vermietung-${i}-ort"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-wohnflaeche"]`).fill(r.address.livingArea)
    await page.locator(`[data-testid="vermietung-${i}-wohnflaeche"]`).blur()
    await page.locator(`[data-testid="vermietung-${i}-einheiten"]`).fill(r.address.units)
    await page.locator(`[data-testid="vermietung-${i}-einheiten"]`).blur()
    const afaBtn = i === 0
      ? page.locator('[data-testid="vermietung-afa-wie-vorjahr-ja"]')
      : page.locator(`[data-testid="vermietung-${i}-afa-wie-vorjahr-ja"]`)
    await afaBtn.click()
    await page.waitForTimeout(300)
  }

  await page.locator('[data-testid="vermietung-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await assertEstimate(page, 'Scenario 04', {})

  unlockTaxYearInDb(sql, s.email, s.year)

  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="verheiratet-ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="verheiratet-ja"]').click()
  await page.locator('[data-testid="abgabe-vergleich-ueberspringen"]').click()
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(page)
  await downloadAndVerifyPdf(page, s.expectedPdfFields)
  console.log('[Scenario 04] PASS: Married couple DE, 3 rentals, 50k capital income and PDF printout verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 04: Thomas & Sabine Weber', runScenario04).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
