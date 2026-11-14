// Scenario 15: Martina Vogt (Cross-Combination Hybrid "Beides" + Swiss Expat "Ja, in die Schweiz" + Verheiratet + 1 Kind)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  openTile,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario15(browser, webOrigin) {
  console.log('\n--- Scenario 15: Cross-Combination Hybrid + Swiss Expat (Beides + Schweiz + Verheiratet + 1 Kind) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+hybrid-ch-${Date.now()}@beispiel.de`,
      firstName: 'Martina',
      lastName: 'Vogt',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-15',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()

  const beidesOpt = page.locator('[data-testid="interview-option-job-Beides"]')
  await beidesOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await beidesOpt.click()

  const gateAck = page.locator('text=Angestellten-Teil vorbereiten')
  await gateAck.waitFor({ state: 'visible', timeout: 10_000 })
  await gateAck.click()

  const chOpt = page.locator('[data-testid="interview-option-ausland-Ja, in die Schweiz"]')
  await chOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await chOpt.click()

  const kinderOpt = page.locator('[data-testid="interview-option-kinder-1 Kind"]')
  await kinderOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await kinderOpt.click()

  const marriedOpt = page.locator('[data-testid="interview-option-familienstand-Verheiratet"]')
  await marriedOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await marriedOpt.click()
  // ADR-0088: the interview asks what Person B does
  await page.locator('[data-testid="interview-option-partner-job-Rente"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-job-Rente"]').click()

  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-wohnsitz-deutschland"]').click()

  await page.locator('[data-testid="ch-tage-input"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-tage-input"]').fill('0')
  await page.locator('[data-testid="ch-tage-weiter"]').click()

  await page.locator('[data-testid="ch-lohnausweis-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="ch-lohnausweis-weiter"]').click()
  await openTile(page, 'einkuenfte')

  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()
  await openTile(page, 'sonderausgaben')

  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }
  await openTile(page, 'arbeitsweg')

  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 15] PASS: Hybrid + Swiss Expat combined flow verified without dead-ends.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 15: Martina Vogt (Hybrid + Swiss Expat)', runScenario15).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
