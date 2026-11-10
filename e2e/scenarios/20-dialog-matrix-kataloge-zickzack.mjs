// Scenario 20: Deep Dialog Matrix — Catalogs Zig-Zag, Follow-ups, Gates & Bumerang-Bug Prevention
// Tests intra-catalog Back navigation, consecutive integer inputs, krypto/vermietung gates,
// and inter-catalog Back navigation into already-completed catalogs (revisit=true).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  openTile,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario20(browser, webOrigin) {
  console.log('\n--- Scenario 20: Dialog Matrix — Catalogs Zig-Zag, Follow-ups, Gates & Revisit Back-Navigation ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+matrix.katalog.${Date.now()}@beispiel.de`,
      firstName: 'Moritz',
      lastName: 'Katalog',
      taxId: '04452397686',
    },
    webOrigin,
    'scenario-20',
  )

  await selectTaxYear2025(page)
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  // Complete LStB
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('62000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('11500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('12400')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  // --- 1. Catalog Lebenslagen Zig-Zag ---
  // DHF = Ja -> dhf-miete appears -> Back -> returns to dhf (NOT LstbScreen!) -> Nein
  await page.locator('[data-testid="katalog-option-dhf-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-dhf-Ja"]').click()
  await page.locator('[data-testid="katalog-input-dhf-miete"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-dhf-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-dhf-Nein"]').click()

  // Umzug = Ja -> enter 1800 -> lands on abfindung -> Back to umzug-kosten -> Back to umzug -> Nein
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-umzug-Ja"]').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').fill('1800')
  await page.locator('[data-testid="katalog-submit-umzug-kosten"]').click()
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-input-umzug-kosten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-umzug-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-umzug-Nein"]').click()

  // Abfindung = Nein, Lohnersatz = Nein
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').click()
  await page.locator('[data-testid="katalog-option-lohnersatz-Nein"]').click()

  // Nebenjob = Midijob -> nebenjob-brutto -> Back -> Nebenjob -> 3600 -> advances to Einkünfte
  await page.locator('[data-testid="katalog-option-nebenjob-Midijob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-nebenjob-Midijob"]').click()
  await page.locator('[data-testid="katalog-input-nebenjob-brutto"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-nebenjob-Nebenjob"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-nebenjob-Nebenjob"]').click()
  await page.locator('[data-testid="katalog-input-nebenjob-brutto"]').fill('3600')
  await page.locator('[data-testid="katalog-submit-nebenjob-brutto"]').click()

  // --- 2. Bumerang-Bug Check #1: Revisit completed Lebenslagen via Cockpit tile & Back from Einkünfte ---
  await page.locator('[data-testid="cockpit-kachel-lebenslagen-status"]', { hasText: 'Erledigt' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await openTile(page, 'lebenslagen')
  // Should reopen on the last walked step of Lebenslagen (nebenjob-brutto), NOT bounce back to Cockpit!
  await page.locator('[data-testid="katalog-input-nebenjob-brutto"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-nebenjob-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-nebenjob-Nein"]').click()

  await nextStep(page)
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await nextStep(page)
  console.log('[Scenario 20] Verified: Revisit of completed Lebenslagen and Back from Einkünfte to Cockpit work cleanly.')

  // --- 3. Catalog Einkünfte: Krypto-Gate & Vermietung-Gate Zig-Zag ---
  await page.locator('[data-testid="katalog-option-einkuenfte-Kapitalerträge"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Kapitalerträge"]').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Krypto"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kap-depot-Krypto"]').click()

  // Krypto-Gate reached -> Back to kap-depot -> Back to einkuenfte
  await page.locator('[data-testid="katalog-option-krypto-gate-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Ausländischer Broker"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  // Vermietung -> Verkauf oder möbliert -> Vermietung-Gate -> Back -> Einfach -> advances to Sonderausgaben
  await page.locator('[data-testid="katalog-option-einkuenfte-Vermietung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Vermietung"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Verkauf oder möbliert"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Verkauf oder möbliert"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-gate-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Einfach"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Einfach"]').click()
  await nextStep(page)

  // --- 4. Catalog Sonderausgaben: KV/PV branches, consecutive integer inputs & Riester ---
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()

  // kv-pv = Ja -> Gesetzlich (freiwillig) -> kv-krankengeld -> Back -> Ausländisch -> kv-krankengeld -> Back -> Privat
  await page.locator('[data-testid="katalog-option-kv-pv-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-Ja"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-art-Gesetzlich (freiwillig)"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-art-Gesetzlich (freiwillig)"]').click()
  await page.locator('[data-testid="katalog-option-kv-krankengeld-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="katalog-option-kv-pv-art-Ausländisch"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-art-Ausländisch"]').click()
  await page.locator('[data-testid="katalog-option-kv-krankengeld-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()

  await page.locator('[data-testid="katalog-option-kv-pv-art-Privat"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kv-pv-art-Privat"]').click()

  // Consecutive integer inputs: kv-pv-betrag -> pv-betrag -> kv-wahl-betrag
  const kvPvInput = page.locator('[data-testid="katalog-input-kv-pv-betrag"]')
  await kvPvInput.waitFor({ state: 'visible', timeout: 10_000 })
  await kvPvInput.fill('3600')
  await page.locator('[data-testid="katalog-submit-kv-pv-betrag"]').click()

  const pvInput = page.locator('[data-testid="katalog-input-pv-betrag"]')
  await pvInput.waitFor({ state: 'visible', timeout: 10_000 })
  const pvInitialValue = await pvInput.inputValue()
  if (pvInitialValue !== '') {
    fail(`[Scenario 20] Expected pv-betrag input to be empty on mount, got "${pvInitialValue}"`)
  }
  await pvInput.fill('600')
  await page.locator('[data-testid="katalog-submit-pv-betrag"]').click()

  const wahlInput = page.locator('[data-testid="katalog-input-kv-wahl-betrag"]')
  await wahlInput.waitFor({ state: 'visible', timeout: 10_000 })
  const wahlInitialValue = await wahlInput.inputValue()
  if (wahlInitialValue !== '') {
    fail(`[Scenario 20] Expected kv-wahl-betrag input to be empty on mount, got "${wahlInitialValue}"`)
  }
  await wahlInput.fill('120')
  await page.locator('[data-testid="katalog-submit-kv-wahl-betrag"]').click()

  // Riester = Ja -> 1200 -> Mittelbar -> returns to CockpitHome
  await page.locator('[data-testid="katalog-option-riester-Ja"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-Ja"]').click()
  await page.locator('[data-testid="katalog-input-riester-betrag"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-input-riester-betrag"]').fill('1200')
  await page.locator('[data-testid="katalog-submit-riester-betrag"]').click()
  await page.locator('[data-testid="katalog-option-riester-art-Mittelbar"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-art-Mittelbar"]').click()

  // --- 5. Bumerang-Bug Check #2: Revisit completed Sonderausgaben & Back from WorkdaysScreen ---
  await page.locator('[data-testid="cockpit-kachel-sonderausgaben-status"]', { hasText: 'Erledigt' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await openTile(page, 'sonderausgaben')
  await page.locator('[data-testid="katalog-option-riester-art-Mittelbar"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-riester-art-Mittelbar"]').click()
  await nextStep(page)
  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })

  console.log('[Scenario 20] PASS: All catalog branches, gates, consecutive integer inputs, and revisit Back-navigation verified.')
  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 20: Dialog Matrix — Catalogs Zig-Zag & Revisit Back', runScenario20).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
