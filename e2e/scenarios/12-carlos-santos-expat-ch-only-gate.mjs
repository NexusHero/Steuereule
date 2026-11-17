// Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  answerBasis,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstbSettled, pauseStromAtCommute, waitForStromNotice } from './helpers/persona-steps.mjs'

export async function runScenario12(browser, webOrigin) {
  console.log('\n--- Scenario 12: Carlos Santos (Expat with non-Swiss foreign income -> CH-Only Gate) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-12', {
    email: `du+carlos.santos.${Date.now()}@beispiel.de`, firstName: 'Carlos', lastName: 'Santos', taxId: '67201938455',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089) shows the CH-only gate inline under the foreign answer; the
  // remaining questions stay open, and Weiter continues without the foreign part.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-In ein anderes Land"]').click()
  await waitForStromNotice(page, 'strom-hinweis-ch-only', ['Ehrlich: andere Länder können wir noch nicht.', 'Jedes Land hat sein eigenes Abkommen mit eigenen Regeln'])
  await answerBasis(page, { job: 'Angestellt', ausland: 'In ein anderes Land', kinder: 'Nein', familienstand: 'Ledig' })

  await completeLstbSettled(page, { grossWage: '60000', wageTax: '11000', socialSecurity: '12000' })

  await pauseStromAtCommute(page)
  await assertCockpitEstimate(page, 'Scenario 12', { direction: 'Erstattung' })
  console.log('[Scenario 12] PASS: CH-Only Gate boundary and continuation flow verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 12: Carlos Santos (CH-Only Gate)', runScenario12).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
