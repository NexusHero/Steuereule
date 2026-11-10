// Scenario 17: Maximilian Allesgeber (Full-Spectrum Maximal Catalog: All "Ja" with Follow-ups in Lebenslagen)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  nextStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario17(browser, webOrigin) {
  console.log('\n--- Scenario 17: Maximal Catalog (All "Ja" in Lebenslagen with follow-ups) ---')
  const ctx = await newContextAtBreakpoint(browser, 's')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+maximal-${Date.now()}@beispiel.de`,
      firstName: 'Maximilian',
      lastName: 'Allesgeber',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-17',
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
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('70000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('14000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13000')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  await page.locator('[data-testid="katalog-option-dhf-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-dhf-Ja"]').click()
  await page.locator('[data-testid="katalog-input-dhf-miete"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-dhf-miete"]').fill('1200')
  await page.locator('[data-testid="katalog-submit-dhf-miete"]').click()

  await page.locator('[data-testid="katalog-option-umzug-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').fill('3500')
  await page.locator('[data-testid="katalog-submit-umzug-kosten"]').click()

  await page.locator('[data-testid="katalog-option-abfindung-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-abfindung-Ja"]').click()
  await page.locator('[data-testid="katalog-input-abfindung-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-abfindung-betrag"]').fill('25000')
  await page.locator('[data-testid="katalog-submit-abfindung-betrag"]').click()

  await page.locator('[data-testid="katalog-option-lohnersatz-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-lohnersatz-Ja"]').click()
  await page.locator('[data-testid="katalog-input-lohnersatz-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-lohnersatz-betrag"]').fill('4000')
  await page.locator('[data-testid="katalog-submit-lohnersatz-betrag"]').click()

  await page.locator('[data-testid="katalog-option-nebenjob-Minijob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-nebenjob-Minijob"]').click()

  await nextStep(page)
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 17] PASS: All Lebenslagen Ja branches with amounts accepted and transitioned seamlessly.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 17: Maximilian Allesgeber (Maximal Catalog)', runScenario17).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
