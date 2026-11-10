// Scenario 07: David Richter (Single Parent, 1 Child Felix, Kindergeld & § 24b Entlastungsbetrag)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario07(browser, webOrigin) {
  console.log('\n--- Scenario 07: David Richter (Single parent, 1 child, Kindergeld & § 24b Entlastungsbetrag) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+david.richter.${Date.now()}@beispiel.de`,
      firstName: 'David',
      lastName: 'Richter',
      taxId: '81234567890',
    },
    webOrigin,
    'scenario-07',
  )

  await selectTaxYear2025(page)

  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Geschieden oder getrennt"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('52000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8400')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('11000')
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

  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()
  await nextStep(page)

  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill('28')
  await page.locator('[data-testid="arbeitstage-krank"]').fill('3')
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill('0')
  await page.locator('[data-testid="feiertage-region-NW"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('25')
  await page.locator('[data-testid="arbeitstage-transport-oepnv"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('Köln')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kachel-alleinerziehend"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled for Scenario 07')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

  const kinderBtn = page.locator('[data-testid="cockpit-kinder"]')
  await kinderBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await kinderBtn.click()

  await page.locator('[data-testid="kind-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kind-vorname"]').fill('Felix')
  await page.locator('[data-testid="kind-nachname"]').fill('Richter')
  await page.locator('[data-testid="kind-geburtsdatum"]').fill('12.04.2019')
  await page.locator('[data-testid="kind-steuerid"]').fill('91234567890')
  await page.locator('[data-testid="kind-kindergeld"]').fill('3060')
  await page.locator('[data-testid="kind-verhaeltnis-1"]').click()
  await page.locator('[data-testid="kind-familienkasse"]').fill('Familienkasse Nordrhein-Westfalen')
  await page.locator('[data-testid="kind-inland-ja"]').click()
  await page.locator('[data-testid="kind-gemeldet-ja"]').click()
  await page.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
  await page.locator('[data-testid="kind-speichern"]').click()
  await page.waitForTimeout(500)

  await page.locator('[data-testid="kinder-weiter"]').click()

  await assertCockpitEstimate(page, 'Scenario 07', { direction: 'Erstattung' })
  console.log('[Scenario 07] PASS: Single parent flow with child and Kindergeld verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 07: David Richter (Single Parent)', runScenario07).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
