// Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides" -> Passable Gewerbe-Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  answerBasis,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb, pauseStromAtCommute, waitForStromNotice } from './helpers/persona-steps.mjs'

export async function runScenario10(browser, webOrigin) {
  console.log('\n--- Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides") ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-10', {
    email: `du+florian.weber.${Date.now()}@beispiel.de`, firstName: 'Florian', lastName: 'Weber', taxId: '45918203714',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089): „Beides“ shows the passable Gewerbe-Gate inline and the
  // remaining questions stay open below it; Weiter acknowledges the notice with the answers.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Beides"]').click()
  await waitForStromNotice(page, 'strom-hinweis-gewerbe', ['Ehrlich: dafür sind wir noch nicht gut genug.', 'Bei „Beides“ sammeln wir deinen Angestellten-Teil komplett ein'])
  await answerBasis(page, { job: 'Beides', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await completeLstb(page, { grossWage: '55000', wageTax: '10500', socialSecurity: '11000' })

  await pauseStromAtCommute(page)
  await assertCockpitEstimate(page, 'Scenario 10', {
    expectedText: 'Die Erstattung rechnen wir bisher nur für Angestellte.',
  })
  console.log('[Scenario 10] PASS: Hybrid "Beides" passable gate and employee calculation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 10: Florian Weber (Hybrid Beides)', runScenario10).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
