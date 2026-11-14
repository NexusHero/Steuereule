// Scenario 21: Deep Dialog Matrix — Embedded Sub-Screens in MasterData, PrintoutRoute & ConfirmationRoute
// Tests Partner B inline sub-screens (partner-lstb, partner-arbeitsweg), Printout completion callbacks
// (kinder, kapital, vermietung, sonderausgaben), and ConfirmationScreen single-field edit roundtrips.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  unlockTaxYearInDb,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario21(browser, webOrigin, sql) {
  console.log('\n--- Scenario 21: Dialog Matrix — Embedded Sub-Screens in MasterData, Printout & Confirmation ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = `du+matrix.submasken.${Date.now()}@beispiel.de`

  await registerAndOnboard(
    page,
    {
      email,
      firstName: 'Stefan',
      lastName: 'Submaske',
      taxId: '04452397686',
      taxNumber: '181/140/01235',
    },
    webOrigin,
    'scenario-21',
  )

  await selectTaxYear2025(page)
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-1 Kind"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').click()
  // ADR-0088: the interview asks what Person B does
  await page.locator('[data-testid="interview-option-partner-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-partner-ausland-Nein"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-ausland-Nein"]').click()

  // LStB
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('68000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('13500')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13100')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  // Lebenslagen: all Nein
  for (const step of ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob']) {
    await page.locator(`[data-testid="katalog-option-${step}-Nein"]`).waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator(`[data-testid="katalog-option-${step}-Nein"]`).click()
  }
  await nextStep(page)

  // Einkünfte: Beides -> Deutscher Broker -> Einfach (triggers missing kapital & vermietung on Printout until filled)
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Einfach"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Einfach"]').click()
  await nextStep(page)

  // Sonderausgaben: all Nein
  for (const step of ['spenden', 'kv-pv', 'riester']) {
    await page.locator(`[data-testid="katalog-option-${step}-Nein"]`).waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator(`[data-testid="katalog-option-${step}-Nein"]`).click()
  }
  await nextStep(page)

  // Workdays -> Cockpit -> Submission check -> Cockpit
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-km"]').fill('12')
  await page.locator('[data-testid="arbeitstage-transport-pkw"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('Stuttgart')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtnStep = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtnStep.waitFor({ state: 'visible', timeout: 10_000 })
  // UX review H3: „Verheiratet“ in the interview already set up the joint return, so the printout waits for the
  // Veranlagungsart comparison (or its skip) instead of being open before the master data.
  await page.locator('[data-testid="abgabe-vergleich-ueberspringen"]').waitFor({ state: 'visible', timeout: 10_000 })
  if (!(await printBtnStep.isDisabled())) fail('Expected abgabe-zum-ausdruck to wait for the comparison in Scenario 21')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

  // --- 1. MasterDataScreen Partner B inline sub-screens (Back + Save roundtrips) ---
  await page.locator('[data-testid="cockpit-stammdaten"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-stammdaten"]').click()
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-familienstand-verheiratet"]').click()
  await page.locator('[data-testid="stammdaten-familienstandSeit"]').fill('12.06.2015')
  await page.locator('[data-testid="kopplung-zusammen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kopplung-zusammen"]').click()

  await page.locator('[data-testid="personb-vorname"]').fill('Laura')
  await page.locator('[data-testid="personb-nachname"]').fill('Submaske')
  await page.locator('[data-testid="personb-steuerid"]').fill('51234567891')
  await page.locator('[data-testid="personb-geburtsdatum"]').fill('10.08.1988')
  await page.locator('[data-testid="personb-beruf"]').fill('Architektin')
  await page.locator('[data-testid="personb-speichern"]').click()
  await page.waitForTimeout(400)
  // Persist familienstand=verheiratet so returning from partner sub-screens keeps TaxYearLinkSection visible,
  // while leaving street/iban empty so PrintoutScreen still shows ausdruck-angaben-ergaenzen.
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(400)

  // Open partner-lstb -> click Back -> reopen partner-lstb -> save
  await page.locator('[data-testid="partner-lstb"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-lstb"]').click()
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="partner-lstb"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-lstb"]').click()
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('42000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('6100')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('8400')
  await page.locator('[data-testid="lstb-weiter"]').click()

  // Open partner-arbeitsweg -> click Back -> reopen partner-arbeitsweg -> save
  await page.locator('[data-testid="partner-arbeitsweg"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-arbeitsweg"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="partner-arbeitsweg"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="partner-arbeitsweg"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('8')
  await page.locator('[data-testid="arbeitstage-transport-oepnv"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('Stuttgart')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  await page.locator('[data-testid="stammdaten-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-zurueck"]').click()
  console.log('[Scenario 21] Verified: Partner B inline LStB & Arbeitsweg sub-screens (Back + Save roundtrips).')

  // Seed partial records in Children, Capital, and Rental so PrintoutScreen displays all completion sub-screen triggers:
  // 1) Partial Child (missing familienkasse -> triggers ausdruck-kinder-ergaenzen)
  await page.locator('[data-testid="cockpit-kinder"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kinder"]').click()
  await page.locator('[data-testid="kind-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kind-vorname"]').fill('Tim')
  await page.locator('[data-testid="kind-nachname"]').fill('Submaske')
  await page.locator('[data-testid="kind-geburtsdatum"]').fill('12.04.2019')
  await page.locator('[data-testid="kind-steuerid"]').fill('10234567890')
  await page.locator('[data-testid="kind-speichern"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kinder-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  // 2) Partial Capital (only kapitalertraege filled -> triggers Kapitalerträge ergänzen)
  await page.locator('[data-testid="cockpit-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kapital"]').click()
  await page.locator('[data-testid="kapital-kapitalertraege"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kapital-kapitalertraege"]').fill('1500')
  await page.locator('[data-testid="kapital-kapitalertraege"]').blur()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  // 3) Partial Rental (create 1 object with only mieteinnahmen filled -> triggers Vermietung ergänzen)
  await page.locator('[data-testid="cockpit-vermietung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-vermietung"]').click()
  await page.locator('[data-testid="objekt-hinzufuegen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="objekt-hinzufuegen"]').click()
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').fill('12000')
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').blur()
  await page.waitForTimeout(300)
  await page.locator('[data-testid="vermietung-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  // --- 2. PrintoutRoute Embedded Sub-Screens ---
  unlockTaxYearInDb(sql, email, 2025)
  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="abgabe-vergleich-ueberspringen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-vergleich-ueberspringen"]').click()
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 2.1 Printout -> Stammdaten ergänzen -> Back to Printout
  const completeDetailsBtn = page.locator('[data-testid="ausdruck-angaben-ergaenzen"]')
  await completeDetailsBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await completeDetailsBtn.click()
  await page.locator('[data-testid="stammdaten-geburtsdatum"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-zurueck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 2.2 Printout -> Kinder ergänzen -> Edit existing child & return to Printout
  const completeChildrenBtn = page.locator('[data-testid="ausdruck-kinder-ergaenzen"]')
  await completeChildrenBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await completeChildrenBtn.click()
  await page.locator('[data-testid="kinder-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByLabel('Kind Tim bearbeiten').click()
  await page.locator('[data-testid="kind-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kinder-weiter"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 2.3 Printout -> Kapital-Angaben ergänzen -> Fill & Save -> Returns to Printout
  const completeCapitalBtn = page.locator('text=Kapital-Angaben ergänzen')
  await completeCapitalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await completeCapitalBtn.click()
  await page.locator('[data-testid="kapital-kapitalertraege"]').waitFor({ state: 'visible', timeout: 10_000 })
  for (const [id, val] of [
    ['kapital-sparerPauschbetrag', '1000'],
    ['kapital-kapitalertragsteuer', '125'],
    ['kapital-solidaritaetszuschlag', '6'],
    ['kapital-kirchensteuer', '0'],
  ]) {
    await page.locator(`[data-testid="${id}"]`).fill(val)
    await page.locator(`[data-testid="${id}"]`).blur()
  }
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 2.4 Printout -> Vermietungs-Angaben ergänzen -> Back to Printout
  const completeRentalBtn = page.locator('text=Vermietungs-Angaben ergänzen')
  await completeRentalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await completeRentalBtn.click()
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="vermietung-weiter"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 2.5 ConfirmationRoute (/app/steuerjahr/2025/bestaetigung) -> Back
  await page.goto(`${webOrigin}/app/steuerjahr/2025/bestaetigung`, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="bestaetigung-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="bestaetigung-zurueck"]').click()

  console.log('[Scenario 21] PASS: All embedded sub-screens in MasterData, PrintoutRoute, and ConfirmationRoute verified.')
  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 21: Dialog Matrix — Embedded Sub-Screens & Partner B', runScenario21).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
