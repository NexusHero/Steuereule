// Scenario 16: Sabine Kranz (Divorced Parent / Geschieden oder getrennt + 1 Kind)
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

export async function runScenario16(browser, webOrigin) {
  console.log('\n--- Scenario 16: Divorced Parent (Geschieden oder getrennt + 1 Kind) ---')
  const ctx = await newContextAtBreakpoint(browser, 'm')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+geschieden-${Date.now()}@beispiel.de`,
      firstName: 'Sabine',
      lastName: 'Kranz',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-16',
  )

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()

  const geschiedenOpt = page.locator('[data-testid="interview-option-familienstand-Geschieden oder getrennt"]')
  await geschiedenOpt.waitFor({ state: 'visible', timeout: 10_000 })
  await geschiedenOpt.click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('48000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('7500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('9500')
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

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled for Scenario 16')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log('[Scenario 16] PASS: Divorced parent flow completed cleanly.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 16: Sabine Kranz (Divorced Parent)', runScenario16).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
