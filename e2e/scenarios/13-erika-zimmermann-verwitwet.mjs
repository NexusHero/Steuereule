// Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  answerBasis,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstbSettled, pauseStromAtCommute } from './helpers/persona-steps.mjs'

export async function runScenario13(browser, webOrigin) {
  console.log('\n--- Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-13', {
    email: `du+erika.zimmermann.${Date.now()}@beispiel.de`, firstName: 'Erika', lastName: 'Zimmermann', taxId: '78310294566',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089).
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verwitwet' })

  await completeLstbSettled(page, { grossWage: '45000', wageTax: '6200', socialSecurity: '9200' })

  await pauseStromAtCommute(page)
  await assertCockpitEstimate(page, 'Scenario 13', { direction: 'Erstattung' })
  console.log('[Scenario 13] PASS: Widowed taxpayer interview and calculation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 13: Erika Zimmermann (Verwitwet)', runScenario13).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
