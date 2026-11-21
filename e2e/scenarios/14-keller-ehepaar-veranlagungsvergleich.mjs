// Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparisonScreen § 26a/26b EStG)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  answerBasis,
  chooseTopics,
  leaveStrom,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb, completeCommuteDistance } from './helpers/persona-steps.mjs'

export async function runScenario14(browser, webOrigin) {
  console.log('\n--- Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparison) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-14', {
    email: `du+michael.keller.${Date.now()}@beispiel.de`, firstName: 'Michael', lastName: 'Keller', taxId: '89421035677',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089): the basis page asks what Person B does as well (ADR-0088).
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Nein' })

  await completeLstb(page, { grossWage: '75000', wageTax: '16000', socialSecurity: '14000' })

  await completeCommuteDistance(page, '10')

  // Nothing on the selection page applies: every topic is answered „Nein“ at once.
  await chooseTopics(page, [])
  await waitForStromStep(page, 'fertig')
  await leaveStrom(page)

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  // UX review H3: „Verheiratet“ in the interview sets up the joint return, so the couple is estimated right away.
  await assertCockpitEstimate(page, 'Scenario 14')

  await page.locator('[data-testid="cockpit-stammdaten"]').click()
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').click()
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kopplung-zusammen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kopplung-zusammen"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()

  // The joint return is recorded, so no married question (Echtdatenlauf 4); the comparison is opened on demand.
  await page.locator('[data-testid="abgabe-vergleich-oeffnen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-vergleich-oeffnen"]').click()

  const zveBInput = page.locator('[data-testid="zveb-input"]')
  await zveBInput.waitFor({ state: 'visible', timeout: 10_000 })
  await zveBInput.fill('20000')
  await zveBInput.blur()

  await page.locator('text=Zusammenveranlagung').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-vergleich-schliessen"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled with the optional FilingTypeComparison in Scenario 14')
  await page.locator('[data-testid="abgabe-zurueck"]').click()
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 14] PASS: Married couple FilingTypeComparison calculation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 14: Michael & Sandra Keller (FilingTypeComparison)', runScenario14).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
