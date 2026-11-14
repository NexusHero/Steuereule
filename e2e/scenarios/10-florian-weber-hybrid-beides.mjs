// Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides" -> Passable Gewerbe-Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  answerBasis,
  leaveStrom,
  waitForStromStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario10(browser, webOrigin) {
  console.log('\n--- Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides") ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+florian.weber.${Date.now()}@beispiel.de`,
      firstName: 'Florian',
      lastName: 'Weber',
      taxId: '45918203714',
    },
    webOrigin,
    'scenario-10',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom's basis page (ADR-0089): „Beides“ shows the passable Gewerbe-Gate inline and the
  // remaining questions stay open below it; Weiter acknowledges the notice with the answers.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Beides"]').click()
  const gate = page.locator('[data-testid="strom-hinweis-gewerbe"]')
  await gate.waitFor({ state: 'visible', timeout: 10_000 })
  await gate.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  await gate.locator('text=Bei „Beides“ sammeln wir deinen Angestellten-Teil komplett ein').waitFor({ state: 'visible', timeout: 10_000 })
  await answerBasis(page, { job: 'Beides', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('55000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('10500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('11000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  await waitForStromStep(page, 'arbeitsweg')
  await leaveStrom(page)
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()
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
