// Scenario 09: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, waitForStromNotice } from './helpers/persona-steps.mjs'

export async function runScenario09(browser, webOrigin) {
  console.log('\n--- Scenario 09: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-09', {
    email: `du+maxi.koch.${Date.now()}@beispiel.de`, firstName: 'Maximiliane', lastName: 'Koch', taxId: '34827190562',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089) shows the Gewerbe-Gate inline, right under the answer that opens it.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Selbstständig"]').click()

  const gate = await waitForStromNotice(page, 'strom-hinweis-gewerbe', ['Ehrlich: dafür sind wir noch nicht gut genug.', 'Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer'])

  const forwardOption = page.locator('text=Angestellten-Teil vorbereiten')
  if ((await forwardOption.count()) > 0 && (await forwardOption.isVisible())) {
    fail('[Scenario 09] Expected terminal Gewerbe-Gate to offer no forward progression for pure Selbstständige.')
  }
  // Terminal: nothing after the gate is asked for a pure Selbstständige.
  if (await page.locator('[data-testid="strom-feld-ausland"]').isVisible()) {
    fail('[Scenario 09] Expected the terminal Gewerbe-Gate to hide the remaining basis questions.')
  }

  // Changing the answer is the way back: the notice goes, the next question comes.
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await gate.waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="strom-feld-ausland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Selbstständig"]').click()
  await gate.waitFor({ state: 'visible', timeout: 10_000 })
  await leaveStrom(page)
  console.log('[Scenario 09] PASS: Terminal Gewerbe-Gate and honest gate boundary verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 09: Maximiliane Koch (Terminal Gewerbe-Gate)', runScenario09).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
