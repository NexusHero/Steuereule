// Scenario 09: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario09(browser, webOrigin) {
  console.log('\n--- Scenario 09: Maximiliane Koch (Pure Freelancer / Selbstständig -> Terminal Gewerbe-Gate) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+maxi.koch.${Date.now()}@beispiel.de`,
      firstName: 'Maximiliane',
      lastName: 'Koch',
      taxId: '34827190562',
    },
    webOrigin,
    'scenario-09',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('text=Selbstständig').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Selbstständig').click()

  await page.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer').waitFor({ state: 'visible', timeout: 10_000 })

  const forwardOption = page.locator('text=Angestellten-Teil vorbereiten')
  if ((await forwardOption.count()) > 0 && (await forwardOption.isVisible())) {
    fail('[Scenario 09] Expected terminal Gewerbe-Gate to offer no forward progression for pure Selbstständige.')
  }

  await page.locator('text=Zurück zur Frage').click()
  await page.locator('text=Selbstständig').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 09] PASS: Terminal Gewerbe-Gate and honest gate boundary verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 09: Maximiliane Koch (Terminal Gewerbe-Gate)', runScenario09).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
