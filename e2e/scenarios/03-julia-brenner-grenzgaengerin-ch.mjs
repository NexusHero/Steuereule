// Scenario 03: Julia Brenner (Swiss Grenzgängerin Person B, Account Coupling & Joint PDF Printout)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIO_2_3_BRENNER } from '../fixtures/scenarios-2025.fixture.mjs'
import { runScenario02 } from './02-markus-brenner-grenzgaenger-ch.mjs'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  answerBasis,
  leaveStrom,
  waitForStromStep,
  saveExchangeRate,
  assertEstimate,
  unlockTaxYearInDb,
  confirmAnnexesIfPresent,
  downloadAndVerifyPdf,
  runStandaloneScenario,
  waitForNetworkQuiet,
} from './helpers/scenario-harness.mjs'

export async function runScenario03(browser, webOrigin, sql, markusSession = null) {
  console.log('\n--- Scenario 03: Julia Brenner (Swiss cross-border Person B, coupling & joint printout) ---')
  const s = SCENARIO_2_3_BRENNER

  // If invoked standalone without an active Markus session, run Scenario 02 first to get the coupling invite code.
  const activeMarkus = markusSession ?? (await runScenario02(browser, webOrigin, sql, { keepOpen: true }))
  const { invitationCode, pageMarkus, ctxMarkus } = activeMarkus

  const ctxJulia = await newContextAtBreakpoint(browser, 'l')
  const pageJulia = await ctxJulia.newPage()
  guardAgainst429(pageJulia, fail)

  await registerAndOnboard(
    pageJulia,
    {
      email: s.julia.email,
      password: s.julia.password,
      firstName: s.julia.profile.firstName,
      lastName: s.julia.profile.lastName,
      taxId: s.julia.profile.taxId,
      taxNumber: s.julia.profile.taxNumber,
    },
    webOrigin,
    'scenario-03',
  )

  await selectTaxYear2025(pageJulia)

  await pageJulia.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089): the basis page asks what Person B does as well (ADR-0088).
  await answerBasis(pageJulia, { ...s.julia.interview, 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz' })

  await waitForStromStep(pageJulia, 'schweiz')
  await pageJulia.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="ch-wohnsitz-deutschland"]').click()

  await pageJulia.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="ch-tage-input"]').fill(String(s.julia.crossBorder.nonReturnDays))
  await pageJulia.locator('[data-testid="ch-tage-weiter"]').click()
  await pageJulia.waitForLoadState('networkidle').catch(() => {})

  await pageJulia.locator('[data-testid="ch-feld-lohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="ch-feld-lohn"]').fill(String(s.julia.crossBorder.wageChf))
  await pageJulia.locator('[data-testid="ch-feld-bruttolohn-total"]').fill(String(s.julia.crossBorder.wageChf))
  await pageJulia.locator('[data-testid="ch-feld-ahv-beitraege"]').fill(String(s.julia.crossBorder.ahvAlvChf))
  await pageJulia.locator('[data-testid="ch-feld-berufliche-vorsorge"]').fill(String(s.julia.crossBorder.pensionChf))
  await pageJulia.locator('[data-testid="ch-feld-nettolohn"]').fill(String(s.julia.crossBorder.netWageChf))
  await pageJulia.locator('[data-testid="ch-feld-quellensteuer"]').fill(String(s.julia.crossBorder.withholdingTaxChf))

  await saveExchangeRate(pageJulia, s.julia.crossBorder.exchangeRateMonth, s.julia.crossBorder.exchangeRate)

  await pageJulia.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').fill(String(s.julia.crossBorder.healthCareEur))
  await pageJulia.locator('[data-testid="ch-vorsorge-krankenkasseChf"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberName"]').fill('Basler Treuhand AG')
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberName"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberStrasse"]').fill('Steinenberg 5')
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberStrasse"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberPlzOrt"]').fill('4051 Basel')
  await pageJulia.locator('[data-testid="ch-ngre-arbeitgeberPlzOrt"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-pkArbeitnehmerChf"]').fill(String(s.julia.crossBorder.pensionObligatoryChf))
  await pageJulia.locator('[data-testid="ch-ngre-pkArbeitnehmerChf"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-pkArbeitgeberChf"]').fill(String(s.julia.crossBorder.pensionEmployerChf))
  await pageJulia.locator('[data-testid="ch-ngre-pkArbeitgeberChf"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-familienzulagenChf"]').fill('0')
  await pageJulia.locator('[data-testid="ch-ngre-familienzulagenChf"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-krankentaggeldChf"]').fill('0')
  await pageJulia.locator('[data-testid="ch-ngre-krankentaggeldChf"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-krankentaggeldArbeitgeberProzent"]').fill(String(s.julia.crossBorder.dailySicknessEmployerPercent))
  await pageJulia.locator('[data-testid="ch-ngre-krankentaggeldArbeitgeberProzent"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-nbuvArbeitgeberProzent"]').fill('0')
  await pageJulia.locator('[data-testid="ch-ngre-nbuvArbeitgeberProzent"]').blur()
  await pageJulia.locator('[data-testid="ch-ngre-sonderfaelle-nein"]').click()
  await pageJulia.waitForTimeout(500)

  await pageJulia.locator('[data-testid="ch-lohnausweis-weiter"]').click()

  await waitForStromStep(pageJulia, 'arbeitsweg')
  await pageJulia.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="arbeitstage-urlaub"]').fill(String(s.julia.commute.vacationDays))
  await pageJulia.locator('[data-testid="arbeitstage-krank"]').fill(String(s.julia.commute.sickDays))
  await pageJulia.locator('[data-testid="arbeitstage-homeoffice"]').fill(String(s.julia.commute.homeOfficeDays))
  await pageJulia.locator(`[data-testid="feiertage-region-${s.julia.commute.region}"]`).click()
  await pageJulia.locator('[data-testid="arbeitstage-km"]').fill(String(s.julia.commute.oneWayKm))
  await pageJulia.locator(`[data-testid="arbeitstage-transport-${s.julia.commute.transport}"]`).click()
  await pageJulia.locator('[data-testid="arbeitstage-arbeitsort"]').fill(s.julia.commute.workplace)
  await pageJulia.locator('[data-testid="arbeitstage-weiter"]').click()

  // The children are entered on Markus's side; Julia pauses the Strom at their step.
  await waitForStromStep(pageJulia, 'kinder')
  await leaveStrom(pageJulia)

  await pageJulia.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageJulia.locator('[data-testid="cockpit-stammdaten"]').click()

  await pageJulia.locator('[data-testid="stammdaten-geburtsdatum"]').fill(s.julia.masterData.birthDate)
  await pageJulia.locator('[data-testid="stammdaten-beruf"]').fill(s.julia.masterData.occupation)
  await pageJulia.locator(`[data-testid="stammdaten-familienstand-${s.julia.masterData.maritalStatus}"]`).click()
  await pageJulia.locator(`[data-testid="stammdaten-religion-${s.julia.masterData.religion}"]`).click()
  await pageJulia.locator('[data-testid="stammdaten-einwilligung"]').click()

  await pageJulia.locator('[data-testid="kopplung-code"]').fill(invitationCode)
  await pageJulia.locator('[data-testid="kopplung-beitreten"]').click()
  // The join and every save the fields above started on their own must be answered before the save below, or
  // the response awaited there is one of theirs and not the answer to the click (a fixed pause did not ensure it:
  // the joint printout then stayed locked on missing master data, seen on #589).
  await waitForNetworkQuiet(pageJulia)
  // Closing the context aborts a save still in flight; Julia's birth date would then be missing and
  // the joint printout locked ("personB"). Wait for the server's answer before leaving.
  const [saved] = await Promise.all([
    pageJulia.waitForResponse((res) => res.request().method() === 'PUT' && res.url().includes('/v1/stammdaten'), { timeout: 10_000 }),
    pageJulia.locator('[data-testid="stammdaten-speichern"]').click(),
  ])
  if (!saved.ok()) fail(`Scenario 03: saving Julia's Stammdaten answered HTTP ${saved.status()}`)
  await waitForNetworkQuiet(pageJulia)
  // Not the timing but the outcome: what the server now holds for Julia must contain what she entered here.
  const stored = await pageJulia.context().request.get(saved.url())
  if (!stored.ok()) fail(`Scenario 03: reading Julia's Stammdaten back answered HTTP ${stored.status()}`)
  const masterData = await stored.json()
  const notStored = ['geburtsdatum', 'beruf', 'familienstand', 'religion'].filter((field) => masterData[field] === null || masterData[field] === undefined)
  if (notStored.length > 0) fail(`Scenario 03: Julia's Stammdaten were saved without ${notStored.join(', ')}; the joint printout would stay locked`)
  await ctxJulia.close()

  await pageMarkus.reload()
  await selectTaxYear2025(pageMarkus)
  await assertEstimate(pageMarkus, 'Scenario 03', {})
  unlockTaxYearInDb(sql, s.markus.email, s.year)

  await pageMarkus.locator('[data-testid="cockpit-ausdruck"]').click()
  await pageMarkus.locator('[data-testid="abgabe-zum-ausdruck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await pageMarkus.locator('[data-testid="abgabe-zum-ausdruck"]').click()
  await pageMarkus.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  await confirmAnnexesIfPresent(pageMarkus)
  await downloadAndVerifyPdf(pageMarkus, s.expectedPdfFields)
  console.log('[Scenario 03] PASS: Swiss Grenzgänger couple joint filing and PDF printout verified.')

  await ctxMarkus.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 03: Julia Brenner (Swiss Grenzgängerin & Joint Printout)', runScenario03).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
