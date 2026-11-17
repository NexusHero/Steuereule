// Scenario 06: Sarah Fischer (Remote Worker, Homeoffice-Pauschale § 4 (5) Nr. 6c, Relocation, Riester, Bayern)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  selectTaxYear2025,
  answerBasis,
  chooseTopics,
  fillTopic,
  leaveStrom,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb, completeCommute, assertPrintoutOpen } from './helpers/persona-steps.mjs'

export async function runScenario06(browser, webOrigin) {
  console.log('\n--- Scenario 06: Sarah Fischer (Remote worker, 180 homeoffice days, relocation, Riester, Bavaria) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-06', {
    email: `du+sarah.fischer.${Date.now()}@beispiel.de`, firstName: 'Sarah', lastName: 'Fischer', taxId: '71234567890', taxNumber: '0912345678',
  })

  await selectTaxYear2025(page)

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089): basis, LStB, way to work, selection, one page per chosen topic, summary.
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await completeLstb(page, { grossWage: '65000', wageTax: '12800', socialSecurity: '13200' })

  await completeCommute(page, { vacationDays: '30', sickDays: '5', homeOfficeDays: '180', region: 'BY', oneWayKm: '15', transport: 'pkw', workplace: 'München' })

  await chooseTopics(page, ['umzug', 'riester'])

  // Defer the relocation costs with „Später“ (AMOUNT_LATER) -> the summary lists the move as open ->
  // the cockpit tile shows "⏳ Betrag offen" -> „Weiter“ in the cockpit returns to it -> 1500 -> "Erledigt".
  await waitForStromStep(page, 'umzug')
  // Each topic page names the form line its amounts go to.
  await page.locator('[data-testid="strom-wirkungszeile"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-spaeter"]').click()
  await fillTopic(page, 'riester', { 'riester-betrag': 1200, 'riester-art': 'Unmittelbar', 'riester-einnahmen-vorjahr': 60000 })

  await waitForStromStep(page, 'fertig')
  await page.locator('[data-testid="strom-offen-umzug"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-uebernommen-riester"]').waitFor({ state: 'visible', timeout: 10_000 })
  // The open entry leads straight to its page; pausing there leaves the amount open.
  await page.locator('[data-testid="strom-offen-umzug"]').click()
  await waitForStromStep(page, 'umzug')
  await leaveStrom(page)

  await page.locator('[data-testid="cockpit-kachel-lebenslagen-status"]', { hasText: '⏳ Betrag offen' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await page.locator('[data-testid="cockpit-weiter"]').click()
  await fillTopic(page, 'umzug', { 'umzug-kosten': 1500 })
  await fillTopic(page, 'riester', {})
  await waitForStromStep(page, 'fertig')
  await page.locator('[data-testid="strom-uebernommen-umzug"]').waitFor({ state: 'visible', timeout: 10_000 })
  await leaveStrom(page)
  // UX review H1: back in the cockpit, the change line names what the move costs changed, in euros.
  await page.locator('[data-testid="cockpit-wirkung"]').waitFor({ state: 'visible', timeout: 10_000 })
  if (!/€/.test(await page.locator('[data-testid="cockpit-wirkung"]').innerText())) fail('[Scenario 06] the change line should name the euro effect')
  await page.locator('[data-testid="cockpit-kachel-lebenslagen-status"]', { hasText: 'Erledigt' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await assertPrintoutOpen(page, 'Scenario 06')

  await assertCockpitEstimate(page, 'Scenario 06', { direction: 'Erstattung' })
  console.log('[Scenario 06] PASS: Remote worker flow with Homeoffice-Pauschale and Riester verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 06: Sarah Fischer (Remote Worker)', runScenario06).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
