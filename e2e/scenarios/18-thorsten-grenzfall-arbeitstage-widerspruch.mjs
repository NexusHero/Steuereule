// Scenario 18: Thorsten Grenzfall (Negative & Contradiction Boundary Testing in WorkdaysScreen)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fail,
  answerBasis,
  chooseTopics,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'
import { startPersona, completeLstb } from './helpers/persona-steps.mjs'

export async function runScenario18(browser, webOrigin) {
  console.log('\n--- Scenario 18: Workdays Contradiction Boundary Testing ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-18', {
    email: `du+workdays-conflict-${Date.now()}@beispiel.de`, firstName: 'Thorsten', lastName: 'Grenzfall', taxId: '04452397686', taxNumber: '181/140/01235',
  })

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089).
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await completeLstb(page, { grossWage: '50000', wageTax: '8000', socialSecurity: '10000' })

  await waitForStromStep(page, 'arbeitsweg')
  const urlaubInput = page.locator('[data-testid="arbeitstage-urlaub"]')
  await urlaubInput.waitFor({ state: 'visible', timeout: 10_000 })
  await urlaubInput.fill('220')

  const krankInput = page.locator('[data-testid="arbeitstage-krank"]')
  await krankInput.fill('100')

  const submitBtn = page.locator('[data-testid="arbeitstage-weiter"]')
  const isSubmitDisabled = await submitBtn.isDisabled()
  if (!isSubmitDisabled) {
    fail('Submit button should be disabled when absences exceed possible workdays')
  }

  await urlaubInput.fill('28')
  await krankInput.fill('5')

  const isSubmitEnabled = await submitBtn.isEnabled()
  if (!isSubmitEnabled) {
    fail('Submit button should be enabled after correcting absences')
  }
  await submitBtn.click()

  await chooseTopics(page, [])
  await waitForStromStep(page, 'fertig')
  await page.locator('[data-testid="strom-uebernommen-arbeitsweg"]').waitFor({ state: 'visible', timeout: 10_000 })
  await leaveStrom(page)

  await page.locator('[data-testid="cockpit-kachel-arbeitsweg-status"]', { hasText: 'Erledigt' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled after correcting absences in Scenario 18')
  console.log('[Scenario 18] PASS: WorkdaysScreen contradiction boundary and recovery verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 18: Thorsten Grenzfall (Workdays Contradiction)', runScenario18).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
