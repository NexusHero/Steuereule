// Scenario 01: Lena Hoffmann (Single DE Employee, Commute, Donations, PDF Printout)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIO_1_LENA } from '../fixtures/scenarios-2025.fixture.mjs'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  assertEstimate,
  answerBasis,
  chooseTopics,
  fillTopic,
  leaveStrom,
  waitForStromStep,
  unlockTaxYearInDb,
  confirmAnnexesIfPresent,
  downloadAndVerifyPdf,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario01(browser, webOrigin, sql) {
  console.log('\n--- Scenario 01: Lena Hoffmann (single, DE employee, commute, donations) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const s1 = SCENARIO_1_LENA

  await registerAndOnboard(
    page,
    {
      email: s1.email,
      password: s1.password,
      firstName: s1.profile.firstName,
      lastName: s1.profile.lastName,
      taxId: s1.profile.taxId,
      taxNumber: s1.profile.taxNumber,
    },
    webOrigin,
    'scenario-01',
  )

  await selectTaxYear2025(page)

  const interviewBtn = page.locator('[data-testid="cockpit-interview"]')
  await interviewBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await interviewBtn.click()

  // The Strom (ADR-0089): basis page, the LStB and the way to work, one selection, one topic page.
  await answerBasis(page, s1.interview)

  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill(String(s1.lstb.grossWage))
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill(String(s1.lstb.wageTax))
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill(String(s1.lstb.socialSecurity))
  await page.locator('[data-testid="lstb-weiter"]').click()

  await waitForStromStep(page, 'arbeitsweg')
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s1.commute.vacationDays))
  await page.locator('[data-testid="arbeitstage-krank"]').fill(String(s1.commute.sickDays))
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s1.commute.homeOfficeDays))
  await page.locator(`[data-testid="feiertage-region-${s1.commute.region}"]`).click()
  await page.locator('[data-testid="arbeitstage-km"]').fill(String(s1.commute.oneWayKm))
  await page.locator(`[data-testid="arbeitstage-transport-${s1.commute.transport}"]`).click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s1.commute.workplace)
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // Only the donations apply: everything else on the selection page is answered „Nein“ at once.
  await chooseTopics(page, ['spenden'])
  await fillTopic(page, 'spenden', { 'spenden-betrag': s1.specialExpenses.donations })

  await waitForStromStep(page, 'fertig')
  // UX review H1 in the Strom: the summary names what the donations changed, in euros.
  const donations = page.locator('[data-testid="strom-uebernommen-spenden"]')
  await donations.waitFor({ state: 'visible', timeout: 10_000 })
  if (!/€/.test(await donations.innerText())) fail('[Scenario 01] the summary should name the euro effect of the donations')
  await leaveStrom(page)

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtnStep = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtnStep.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtnStep.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled for Scenario 01')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

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

  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  await assertEstimate(page, 'Scenario 01', { direction: 'Erstattung', contains: s1.expectedEstimate.targetRefund })

  unlockTaxYearInDb(sql, s1.email, s1.year)

  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(page)
  await downloadAndVerifyPdf(page, s1.expectedPdfFields)
  console.log('[Scenario 01] PASS: Registration, interview, LStB, commute, estimate and PDF printout verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 01: Lena Hoffmann', runScenario01).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
