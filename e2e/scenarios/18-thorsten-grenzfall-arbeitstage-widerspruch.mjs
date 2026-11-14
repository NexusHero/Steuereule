// Scenario 18: Thorsten Grenzfall (Negative & Contradiction Boundary Testing in WorkdaysScreen)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  answerBasis,
  chooseTopics,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario18(browser, webOrigin) {
  console.log('\n--- Scenario 18: Workdays Contradiction Boundary Testing ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+workdays-conflict-${Date.now()}@beispiel.de`,
      firstName: 'Thorsten',
      lastName: 'Grenzfall',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-18',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  // The Strom (ADR-0089).
  await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })

  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('50000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('10000')
  await page.locator('[data-testid="lstb-weiter"]').click()

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
