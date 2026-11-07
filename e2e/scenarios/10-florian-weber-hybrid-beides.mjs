// Scenario 10: Florian Weber (Hybrid: Angestellt + Nebenberuflich Gewerblich "Beides" -> Passable Gewerbe-Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
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
  await page.locator('text=Beides').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Beides').click()

  await page.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  const acknowledgeOption = page.locator('text=Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')
  await acknowledgeOption.waitFor({ state: 'visible', timeout: 10_000 })
  await acknowledgeOption.click()

  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Ledig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Ledig').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('55000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('10500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('11000')
  await page.locator('[data-testid="lstb-weiter"]').click()

  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 10', { direction: 'Erstattung' })
  console.log('[Scenario 10] PASS: Hybrid "Beides" passable gate and employee calculation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 10: Florian Weber (Hybrid Beides)', runScenario10).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
