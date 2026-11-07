// Scenario 06: Sarah Fischer (Remote Worker, Homeoffice-Pauschale § 4 (5) Nr. 6c, Relocation, Riester, Bayern)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario06(browser, webOrigin) {
  console.log('\n--- Scenario 06: Sarah Fischer (Remote worker, 180 homeoffice days, relocation, Riester, Bavaria) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+sarah.fischer.${Date.now()}@beispiel.de`,
      firstName: 'Sarah',
      lastName: 'Fischer',
      taxId: '71234567890',
      taxNumber: '0912345678',
    },
    webOrigin,
    'scenario-06',
  )

  await selectTaxYear2025(page)

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('65000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('12800')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13200')
  await page.locator('[data-testid="lstb-weiter"]').click()

  await page.locator('[data-testid="katalog-option-dhf-Nein"]').click()
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').fill('1500')
  await page.locator('[data-testid="katalog-submit-umzug-kosten"]').click()
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').click()
  await page.locator('[data-testid="katalog-option-lohnersatz-Nein"]').click()
  await page.locator('[data-testid="katalog-option-nebenjob-Nein"]').click()

  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()

  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Ja"]').click()
  await page.locator('[data-testid="katalog-input-riester-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-riester-betrag"]').fill('1200')
  await page.locator('[data-testid="katalog-submit-riester-betrag"]').click()
  await page.locator('[data-testid="katalog-option-riester-art-Unmittelbar"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-art-Unmittelbar"]').click()
  await page.locator('[data-testid="katalog-input-riester-einnahmen-vorjahr"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-riester-einnahmen-vorjahr"]').fill('60000')
  await page.locator('[data-testid="katalog-submit-riester-einnahmen-vorjahr"]').click()

  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill('30')
  await page.locator('[data-testid="arbeitstage-krank"]').fill('5')
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill('180')
  await page.locator('[data-testid="feiertage-region-BY"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('15')
  await page.locator('[data-testid="arbeitstage-transport-pkw"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('München')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  await page.locator('[data-testid="plausibilitaet-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="plausibilitaet-weiter"]').click()
  await page.locator('[data-testid="verheiratet-nein"]').click()
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()

  await assertCockpitEstimate(page, 'Scenario 06', { direction: 'Erstattung' })
  console.log('[Scenario 06] PASS: Remote worker flow with Homeoffice-Pauschale and Riester verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 06: Sarah Fischer (Remote Worker)', runScenario06).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
