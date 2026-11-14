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
  // The pensioner's foreign question names „Nein“ in its help text too (UX review M3): click the options by id.
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
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
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  // UX review K3: a pensioner is estimated now (Ertragsanteil of the private pension).
  await assertCockpitEstimate(page, 'Scenario 11')
  // A taxable share of 3.240 € stays below the basic allowance: exactly 0 €, said as neither refund nor back payment.
  await page.locator('[data-testid="cockpit-ausgeglichen"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 11] PASS: Private Pension Ertragsanteil calculation and honest cockpit notice verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 11: Klaus Bergmann (Private Pension)', runScenario11).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
