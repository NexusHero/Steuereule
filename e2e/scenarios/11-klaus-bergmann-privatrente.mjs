// Scenario 11: Klaus Bergmann (Retiree with Private Pension § 22 EStG Ertragsanteilsbesteuerung)
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

export async function runScenario11(browser, webOrigin) {
  console.log('\n--- Scenario 11: Klaus Bergmann (Retiree with Private Pension § 22 EStG Ertragsanteil) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+klaus.bergmann.${Date.now()}@beispiel.de`,
      firstName: 'Klaus',
      lastName: 'Bergmann',
      taxId: '56192837401',
    },
    webOrigin,
    'scenario-11',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Rente').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Rente').click()
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Nein').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Nein').click()
  await page.locator('text=Ledig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Ledig').click()

  await page.locator('text=Deine Rente').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Private Rentenversicherung').click()

  const alterInput = page.getByLabel(/Alter bei Rentenbeginn/i)
  await alterInput.waitFor({ state: 'visible', timeout: 10_000 })

  const startJahrInput = page.getByLabel(/Jahr des Rentenbeginns/i)
  if ((await startJahrInput.count()) > 0 && (await startJahrInput.isVisible())) {
    fail('[Scenario 11] Expected "Jahr des Rentenbeginns" to be hidden for Private Rentenversicherung.')
  }

  const jahresInput = page.getByLabel(/Jahresbetrag der Rente/i)
  await jahresInput.fill('18000')
  await jahresInput.blur()

  await alterInput.fill('66')
  await alterInput.blur()

  await page.locator('text=3240 €').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Weiter').last().click()
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await assertCockpitEstimate(page, 'Scenario 11', { expectedText: 'Die Erstattung rechnen wir bisher nur für Angestellte.' })
  console.log('[Scenario 11] PASS: Private Pension Ertragsanteil calculation and honest cockpit notice verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 11: Klaus Bergmann (Private Pension)', runScenario11).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
