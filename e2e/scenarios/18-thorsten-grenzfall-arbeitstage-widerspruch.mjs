// Scenario 18: Thorsten Grenzfall (Negative & Contradiction Boundary Testing in WorkdaysScreen)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
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
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('50000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('10000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }

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

  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 18] PASS: WorkdaysScreen contradiction boundary and recovery verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 18: Thorsten Grenzfall (Workdays Contradiction)', runScenario18).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
