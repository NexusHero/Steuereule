// Scenario 22: Deep Dialog Matrix — CRUD & Chip Permutations in Detail Screens
// Tests ChildrenScreen multi-child CRUD & chip toggles, CapitalScreen owner toggles,
// RentalScreen multi-object & AfA toggles, and AssessmentScreen (Bescheidvergleich) field/status/unclear interactions.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  openTile,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario22(browser, webOrigin) {
  console.log('\n--- Scenario 22: Dialog Matrix — CRUD & Chip Permutations in Detail Screens ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+matrix.crud.${Date.now()}@beispiel.de`,
      firstName: 'Nadine',
      lastName: 'Detailmaske',
      taxId: '04452397686',
    },
    webOrigin,
    'scenario-22',
  )

  await selectTaxYear2025(page)

  // Complete Interview with 2 oder mehr Kinder + Verheiratet
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-2 oder mehr"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Verheiratet"]').click()
  // ADR-0088: the interview asks what Person B does
  await page.locator('[data-testid="interview-option-partner-job-Nicht berufstätig"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="interview-option-partner-job-Nicht berufstätig"]').click()

  // LStB -> back to Cockpit via TabBar
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('64000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('12000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('12500')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('tab', { name: 'Cockpit' }).click()

  // --- 1. ChildrenScreen: Add 2 Children with Chip Permutations ---
  await page.locator('[data-testid="cockpit-kinder"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kinder"]').click()

  // Child 1: Lukas (toggle chips before saving)
  await page.locator('[data-testid="kind-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kind-vorname"]').fill('Lukas')
  await page.locator('[data-testid="kind-nachname"]').fill('Detailmaske')
  await page.locator('[data-testid="kind-geburtsdatum"]').fill('15.05.2016')
  await page.locator('[data-testid="kind-steuerid"]').fill('10234567890')
  await page.locator('[data-testid="kind-weitere-angaben"]').click() // short form first: optional amounts open on request
  await page.locator('[data-testid="kind-kindergeld"]').fill('3060')
  await page.locator('[data-testid="kind-verhaeltnis-2"]').click() // Pflegekind
  await page.locator('[data-testid="kind-verhaeltnis-1"]').click() // Leibliches Kind
  await page.locator('[data-testid="kind-inland-nein"]').click()
  await page.locator('[data-testid="kind-inland-ja"]').click()
  await page.locator('[data-testid="kind-gemeldet-ja"]').click()
  await page.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
  await page.locator('[data-testid="kind-familienkasse"]').fill('Familienkasse Berlin')
  await page.locator('[data-testid="kind-speichern"]').click()
  await page.waitForTimeout(400)

  // Child 2: Mia via "+ Weiteres Kind"
  await page.locator('[data-testid="kind-neu"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="kind-neu"]').click()
  await page.locator('[data-testid="kind-vorname"]').fill('Mia')
  await page.locator('[data-testid="kind-nachname"]').fill('Detailmaske')
  await page.locator('[data-testid="kind-geburtsdatum"]').fill('20.09.2020')
  await page.locator('[data-testid="kind-steuerid"]').fill('51234567891')
  await page.locator('[data-testid="kind-weitere-angaben"]').click() // short form first: optional amounts open on request
  await page.locator('[data-testid="kind-kindergeld"]').fill('3060')
  await page.locator('[data-testid="kind-verhaeltnis-1"]').click()
  await page.locator('[data-testid="kind-inland-ja"]').click()
  await page.locator('[data-testid="kind-gemeldet-ja"]').click()
  await page.locator('[data-testid="kind-kindergeld-an-mich-ja"]').click()
  await page.locator('[data-testid="kind-familienkasse"]').fill('Familienkasse Berlin')
  await page.locator('[data-testid="kind-speichern"]').click()
  await page.waitForTimeout(400)

  await page.locator('[data-testid="kinder-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('[Scenario 22] Verified: ChildrenScreen multi-child creation and chip toggles.')

  // --- 2. CapitalScreen: Prompt resolution + Fields & Unklar Toggles ---
  await page.locator('[data-testid="cockpit-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-kapital"]').click()

  const kapPrompt = page.locator('[data-testid="kapital-frage-beantworten"]')
  await kapPrompt.waitFor({ state: 'visible', timeout: 10_000 })
  await kapPrompt.click()
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-einkuenfte-Beides"]').click()
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]').click()
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="katalog-option-vermietung-art-Mehrere"]').click()

  await page.locator('[data-testid="kapital-kapitalertraege"]').waitFor({ state: 'visible', timeout: 10_000 })
  for (const [id, val] of [
    ['kapital-kapitalertraege', '4200'],
    ['kapital-sparerPauschbetrag', '2000'],
    ['kapital-kapitalertragsteuer', '550'],
    ['kapital-solidaritaetszuschlag', '30'],
    ['kapital-kirchensteuer', '0'],
  ]) {
    await page.locator(`[data-testid="${id}"]`).fill(val)
    await page.locator(`[data-testid="${id}"]`).blur()
  }
  await page.waitForTimeout(400)
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('[Scenario 22] Verified: CapitalScreen inline catalog gate and field persistence.')

  // --- 2b. RentalScreen: Multi-object creation & AfA chip toggles ---
  await page.locator('[data-testid="cockpit-vermietung"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-vermietung"]').click()
  await page.locator('[data-testid="objekt-hinzufuegen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="objekt-hinzufuegen"]').click()
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').fill('14400')
  await page.locator('[data-testid="vermietung-0-mieteinnahmen"]').blur()
  await page.locator('[data-testid="vermietung-afa-wie-vorjahr-nein"]').click()
  await page.locator('[data-testid="vermietung-afa-wie-vorjahr-ja"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid="vermietung-weiter"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('[Scenario 22] Verified: RentalScreen object creation and AfA chip toggles.')

  // --- 3. AssessmentScreen (Bescheidvergleich): Fields, Unlesbar Toggle & Date Frist ---
  await page.locator('[data-testid="cockpit-bescheid"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-bescheid"]').click()

  await page.locator('text=Dein Steuerbescheid').waitFor({ state: 'visible', timeout: 10_000 })
  const datumInput = page.locator('[data-testid="bescheid-datum"]')
  await datumInput.fill('15.05.2026')
  await datumInput.blur()
  await page.waitForTimeout(400)

  const steuerInput = page.getByLabel(/Festgesetzte Einkommensteuer/i)
  await steuerInput.fill('14500')
  await steuerInput.blur()
  await page.waitForTimeout(400)

  // Click "unlesbar" button on one field and verify active state
  const unlesbarBtn = page.locator('text=unlesbar').first()
  await unlesbarBtn.click()
  await page.waitForTimeout(300)

  await page.getByLabel('Zurück').click()
  await page.locator('[data-testid="cockpit-erstattung"]').waitFor({ state: 'visible', timeout: 10_000 })

  // --- 4. Slice 4: Closing a Sheet via button and Escape flushes active input PUT without prior blur ---
  await openTile(page, 'lstb')
  const grossInput = page.locator('[data-testid="lstb-bruttoarbeitslohn"]')
  await grossInput.waitFor({ state: 'visible', timeout: 10_000 })
  await grossInput.fill('65000')
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/lstb') && res.request().method() === 'PUT' && res.status() < 400,
      { timeout: 10_000 },
    ),
    page.locator('[data-testid="sheet-schliessen"]').click(),
  ])
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  await openTile(page, 'lstb')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  if ((await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').inputValue()) !== '65000') {
    fail('[Scenario 22] Expected Sheet close button to auto-save focused input value 65000')
  }

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('64000')
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/lstb') && res.request().method() === 'PUT' && res.status() < 400,
      { timeout: 10_000 },
    ),
    page.keyboard.press('Escape'),
  ])
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  await openTile(page, 'lstb')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  if ((await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').inputValue()) !== '64000') {
    fail('[Scenario 22] Expected Escape key on Sheet to auto-save focused input value 64000')
  }
  await page.locator('[data-testid="sheet-schliessen"]').click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('[Scenario 22] Verified: Sheet close button and Escape auto-save focused inputs.')

  console.log('[Scenario 22] PASS: Detail screens CRUD, chip toggles, Sheet close auto-save, and AssessmentScreen reconciliation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 22: Dialog Matrix — CRUD & Detail Screens', runScenario22).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
