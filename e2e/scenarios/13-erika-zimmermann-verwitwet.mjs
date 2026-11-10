// Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting)
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

export async function runScenario13(browser, webOrigin) {
  console.log('\n--- Scenario 13: Erika Zimmermann (Widowed taxpayer / Verwitwet -> Gnadensplitting) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+erika.zimmermann.${Date.now()}@beispiel.de`,
      firstName: 'Erika',
      lastName: 'Zimmermann',
      taxId: '78310294566',
    },
    webOrigin,
    'scenario-13',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Angestellt').click()
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Verwitwet').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Verwitwet').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('45000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('6200')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('9200')
  await page.locator('[data-testid="lstb-sozialversicherung"]').blur()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('[data-testid="lstb-weiter"]').click()

  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()
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
