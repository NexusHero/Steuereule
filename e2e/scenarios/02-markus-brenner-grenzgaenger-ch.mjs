// Scenario 02: Markus Brenner (Swiss Grenzgänger Person A, 2 Children, Coupling Invitation Code)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIO_2_3_BRENNER } from '../fixtures/scenarios-2025.fixture.mjs'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario02(browser, webOrigin, _sql, { keepOpen = false } = {}) {
  console.log('\n--- Scenario 02: Markus Brenner (Swiss cross-border Person A, 2 children, coupling invite) ---')
  const ctxMarkus = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const pageMarkus = await ctxMarkus.newPage()
  guardAgainst429(pageMarkus, fail)

  const s = SCENARIO_2_3_BRENNER

  await registerAndOnboard(
    pageMarkus,
    {
      email: s.markus.email,
      password: s.markus.password,
      firstName: s.markus.profile.firstName,
      lastName: s.markus.profile.lastName,
      taxId: s.markus.profile.taxId,
      taxNumber: s.markus.profile.taxNumber,
    },
    webOrigin,
    'scenario-02',
  )

  await selectTaxYear2025(pageMarkus)

  await pageMarkus.locator('[data-testid="cockpit-interview"]').click()
  await pageMarkus.locator(`[data-testid="interview-option-job-${s.markus.interview.job}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-ausland-${s.markus.interview.ausland}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-kinder-${s.markus.interview.kinder}"]`).click()
  await pageMarkus.locator(`[data-testid="interview-option-familienstand-${s.markus.interview.familienstand}"]`).click()

  await pageMarkus.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="ch-wohnsitz-deutschland"]').click()

  await pageMarkus.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="ch-tage-input"]').fill(String(s.markus.crossBorder.nonReturnDays))
  await pageMarkus.locator('[data-testid="ch-tage-weiter"]').click()

  await pageMarkus.locator('[data-testid="ch-feld-lohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="ch-feld-lohn"]').fill(String(s.markus.crossBorder.wageChf))
  await pageMarkus.locator('[data-testid="ch-feld-andere-leistungen"]').fill(String(s.markus.crossBorder.familyAllowancesChf))
  await pageMarkus.locator('[data-testid="ch-feld-bruttolohn-total"]').fill(String(s.markus.crossBorder.grossWageChf))
  await pageMarkus.locator('[data-testid="ch-feld-ahv-beitraege"]').fill(String(s.markus.crossBorder.ahvAlvChf))
  await pageMarkus.locator('[data-testid="ch-feld-berufliche-vorsorge"]').fill(String(s.markus.crossBorder.pensionChf))
  await pageMarkus.locator('[data-testid="ch-feld-nettolohn"]').fill(String(s.markus.crossBorder.netWageChf))
  await pageMarkus.locator('[data-testid="ch-feld-quellensteuer"]').fill(String(s.markus.crossBorder.withholdingTaxChf))

  await pageMarkus.locator(`[data-testid="ch-wechselkurs-monat-${s.markus.crossBorder.exchangeRateMonth.slice(5)}"]`).click()
  await pageMarkus.locator('[data-testid="ch-wechselkurs-kurs"]').fill(s.markus.crossBorder.exchangeRate)
  await pageMarkus.locator('[data-testid="ch-wechselkurs-speichern"]').click()

  await pageMarkus.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').fill(String(s.markus.crossBorder.healthCareEur))
  await pageMarkus.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberName"]').fill('Rheinpharma AG')
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberName"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberStrasse"]').fill('Grenzacherstrasse 100')
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberStrasse"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberPlzOrt"]').fill('4058 Basel')
  await pageMarkus.locator('[data-testid="ch-ngre-arbeitgeberPlzOrt"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-pkArbeitnehmerChf"]').fill(String(s.markus.crossBorder.pensionObligatoryChf))
  await pageMarkus.locator('[data-testid="ch-ngre-pkArbeitnehmerChf"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-pkArbeitgeberChf"]').fill(String(s.markus.crossBorder.pensionEmployerChf))
  await pageMarkus.locator('[data-testid="ch-ngre-pkArbeitgeberChf"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-familienzulagenChf"]').fill(String(s.markus.crossBorder.familyAllowancesChf))
  await pageMarkus.locator('[data-testid="ch-ngre-familienzulagenChf"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-krankentaggeldChf"]').fill(String(s.markus.crossBorder.dailySicknessAllowanceEur))
  await pageMarkus.locator('[data-testid="ch-ngre-krankentaggeldChf"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-krankentaggeldArbeitgeberProzent"]').fill(String(s.markus.crossBorder.dailySicknessEmployerPercent))
  await pageMarkus.locator('[data-testid="ch-ngre-krankentaggeldArbeitgeberProzent"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-nbuvArbeitgeberProzent"]').fill('0')
  await pageMarkus.locator('[data-testid="ch-ngre-nbuvArbeitgeberProzent"]').blur()
  await pageMarkus.locator('[data-testid="ch-ngre-sonderfaelle-nein"]').click()
  await pageMarkus.waitForTimeout(500)

  await pageMarkus.locator('[data-testid="ch-lohnausweis-weiter"]').click()
  await nextStep(pageMarkus)

  await pageMarkus.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()
  await nextStep(pageMarkus)

  await pageMarkus.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await pageMarkus.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await pageMarkus.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="katalog-option-riester-Nein"]').click()
  await nextStep(pageMarkus)

  await pageMarkus.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.markus.commute.vacationDays))
  await pageMarkus.locator('[data-testid="arbeitstage-krank"]').fill(String(s.markus.commute.sickDays))
  await pageMarkus.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.markus.commute.homeOfficeDays))
  await pageMarkus.locator(`[data-testid="feiertage-region-${s.markus.commute.region}"]`).click()
  await pageMarkus.locator('[data-testid="arbeitstage-km"]').fill(String(s.markus.commute.oneWayKm))
  await pageMarkus.locator(`[data-testid="arbeitstage-transport-${s.markus.commute.transport}"]`).click()
  await pageMarkus.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.markus.commute.workplace)
  await pageMarkus.locator('[data-testid="arbeitstage-weiter"]').click()

  await pageMarkus.locator('[data-testid="cockpit-kinder"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="cockpit-kinder"]').click()

  for (const child of s.markus.children) {
    await pageMarkus.locator('[data-testid="kind-neu"], [data-testid="kind-vorname"]').first().waitFor({ state: 'visible', timeout: 10_000 })
    if (await pageMarkus.locator('[data-testid="kind-neu"]').isVisible()) {
      await pageMarkus.locator('[data-testid="kind-neu"]').click()
    }
    await pageMarkus.locator('[data-testid="kind-vorname"]').fill(child.firstName)
    await pageMarkus.locator('[data-testid="kind-nachname"]').fill(child.lastName)
    await pageMarkus.locator('[data-testid="kind-geburtsdatum"]').fill(child.birthDate)
    await pageMarkus.locator('[data-testid="kind-steuerid"]').fill(child.taxId)
    // Short form first: the optional amounts open on request.
    await pageMarkus.locator('[data-testid="kind-weitere-angaben"]').click()
    await pageMarkus.locator('[data-testid="kind-schweizer-kinderzulage"]').fill(String(child.swissAllowanceEur))
    await pageMarkus.locator('[data-testid="kind-kindergeld"]').fill(String(child.childBenefitEur))
    await pageMarkus.locator('[data-testid="kind-verhaeltnis-1"]').click()
    await pageMarkus.locator('[data-testid="kind-verhaeltnis-b-1"]').click()
    await pageMarkus.locator('[data-testid="kind-familienkasse"]').fill('Familienkasse Baden-Württemberg West')
    await pageMarkus.locator('[data-testid="kind-inland-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-gemeldet-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
    await pageMarkus.locator('[data-testid="kind-speichern"]').click()
    await pageMarkus.waitForTimeout(400)
  }

  await pageMarkus.locator('[data-testid="kinder-weiter"]').click()

  await pageMarkus.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="cockpit-stammdaten"]').click()

  await pageMarkus.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.markus.masterData.birthDate)
  await pageMarkus.locator('[data-testid="stammdaten-beruf"]').fill(s.markus.masterData.occupation)
  await pageMarkus.locator('[data-testid="stammdaten-strasse"]').fill(s.markus.masterData.street)
  await pageMarkus.locator('[data-testid="stammdaten-hausnummer"]').fill(s.markus.masterData.houseNumber)
  await pageMarkus.locator('[data-testid="stammdaten-plz"]').fill(s.markus.masterData.postalCode)
  await pageMarkus.locator('[data-testid="stammdaten-wohnort"]').fill(s.markus.masterData.city)
  await pageMarkus.locator(`[data-testid="stammdaten-familienstand-${s.markus.masterData.maritalStatus}"]`).click()
  await pageMarkus.locator('[data-testid="stammdaten-familienstandSeit"]').fill(s.markus.masterData.marriedSince)
  await pageMarkus.locator(`[data-testid="stammdaten-religion-${s.markus.masterData.religion}"]`).click()
  await pageMarkus.locator('[data-testid="stammdaten-einwilligung"]').click()
  await pageMarkus.locator('[data-testid="stammdaten-finanzamt"]').fill(s.markus.masterData.taxOffice)
  await pageMarkus.locator('[data-testid="stammdaten-iban"]').fill(s.markus.masterData.iban)

  await pageMarkus.locator('[data-testid="kopplung-zusammen"]').click()
  await pageMarkus.locator('[data-testid="stammdaten-speichern"]').click()
  await pageMarkus.waitForTimeout(500)

  await pageMarkus.locator('[data-testid="kopplung-code-anzeige"]').waitFor({ state: 'visible', timeout: 10_000 })
  const codeNotice = await pageMarkus.locator('[data-testid="kopplung-code-anzeige"]').innerText()
  const match = codeNotice.match(/([0-9A-F]{16})/i)
  if (!match) fail(`could not extract 16-character invitation code from notice: "${codeNotice}"`)
  const invitationCode = match[1]
  console.log(`[Scenario 02] PASS: Markus Brenner CH Grenzgänger & invitation code (${invitationCode}) verified.`)

  await pageMarkus.locator('[data-testid="stammdaten-zurueck"]').click()

  if (!keepOpen) {
    await ctxMarkus.close()
    return null
  }
  return { invitationCode, pageMarkus, ctxMarkus }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 02: Markus Brenner (Swiss Grenzgänger Person A)', runScenario02).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
