// Scenario 16: Sabine Kranz (Divorced Parent / Geschieden oder getrennt + 1 Kind)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  answerBasis,
  chooseTopics,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb, completeCommuteDistance } from './helpers/persona-steps.mjs'

export async function runScenario16(browser, webOrigin) {
  console.log('\n--- Scenario 16: Divorced Parent (Geschieden oder getrennt + 1 Kind) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-16', {
    email: `du+geschieden-${Date.now()}@beispiel.de`, firstName: 'Sabine', lastName: 'Kranz', taxId: '04452397686', taxNumber: '181/140/01235',
  }, 'm')

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089).
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Geschieden oder getrennt' })

  await completeLstb(page, { grossWage: '48000', wageTax: '7500', socialSecurity: '9500' })

  await completeCommuteDistance(page, '10')

  // The child and the single-parent questions wait: the child step is passed over, the
  // single-parent page is put off with „Später“ — the summary still offers the submission.
  await waitForStromStep(page, 'kinder')
  await page.locator('[data-testid="kinder-weiter"]').click()
  await chooseTopics(page, [])
  await waitForStromStep(page, 'alleinerziehend')
  await page.locator('[data-testid="strom-spaeter"]').click()
  await waitForStromStep(page, 'fertig')
  await page.locator('[data-testid="strom-offen-alleinerziehend"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-abgabe"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled for Scenario 16')
  // The submission's back leads to the cockpit.
  await page.locator('[data-testid="abgabe-zurueck"]').click()
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 16] PASS: Divorced parent flow completed cleanly.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 16: Sabine Kranz (Divorced Parent)', runScenario16).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
