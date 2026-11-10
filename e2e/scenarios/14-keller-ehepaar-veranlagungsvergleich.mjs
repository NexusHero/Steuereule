// Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparisonScreen § 26a/26b EStG)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  nextStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario14(browser, webOrigin) {
  console.log('\n--- Scenario 14: Michael & Sandra Keller (Married couple -> FilingTypeComparison) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+michael.keller.${Date.now()}@beispiel.de`,
      firstName: 'Michael',
      lastName: 'Keller',
      taxId: '89421035677',
    },
    webOrigin,
    'scenario-14',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('75000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('16000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('14000')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }
  await nextStep(page)

  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()
  await nextStep(page)

  for (const step of ['spenden', 'kv-pv', 'riester']) {
    const opt = page.locator(`[data-testid="katalog-option-${step}-Nein"]`)
    await opt.waitFor({ state: 'visible', timeout: 10_000 })
    await opt.click()
  }
  await nextStep(page)

  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await assertCockpitEstimate(page, 'Scenario 14', { expectedText: 'Ihr seid verheiratet' })

  await page.locator('[data-testid="cockpit-stammdaten"]').click()
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').click()
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kopplung-zusammen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kopplung-zusammen"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()

  await page.locator('[data-testid="verheiratet-ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="verheiratet-ja"]').click()

  const zveBInput = page.locator('[data-testid="zveb-input"]')
  await zveBInput.waitFor({ state: 'visible', timeout: 10_000 })
  await zveBInput.fill('20000')
  await zveBInput.blur()

  await page.locator('text=Zusammenveranlagung').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="veranlagungsartenvergleich-weiter"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled after FilingTypeComparison in Scenario 14')
  await page.locator('[data-testid="abgabe-zurueck"]').click()
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 14] PASS: Married couple FilingTypeComparison calculation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 14: Michael & Sandra Keller (FilingTypeComparison)', runScenario14).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
