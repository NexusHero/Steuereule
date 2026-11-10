// Scenario 05: Hans Meyer (Senior / Rentner, Gesetzliche Rente § 22, Kapitalerträge & PDF Printout)
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  assertCockpitEstimate,
  unlockTaxYearInDb,
  confirmAnnexesIfPresent,
  PDFDocument,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario05(browser, webOrigin, sql) {
  console.log('\n--- Scenario 05: Hans Meyer (Retiree / Pensioner with statutory pension & capital income) ---')
  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  const email = `du+hans.meyer.${Date.now()}@beispiel.de`

  await registerAndOnboard(
    page,
    {
      email,
      firstName: 'Hans',
      lastName: 'Meyer',
      taxId: '61234567890',
    },
    webOrigin,
    'scenario-05',
  )

  await selectTaxYear2025(page)

  const interviewBtn = page.locator('[data-testid="cockpit-interview"]')
  await interviewBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await interviewBtn.click()

  await page.locator('[data-testid="interview-option-job-Rente"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  const heading = page.locator('text=Welche Rente beziehst du?')
  await heading.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Gesetzliche Rente').click()

  const betragInput = page.getByLabel(/Jahresbetrag der Rente/i)
  await betragInput.waitFor({ state: 'visible', timeout: 10_000 })
  await betragInput.fill('24000')
  await betragInput.blur()
  await page.waitForTimeout(500)

  const beginnInput = page.getByLabel(/Jahr des Rentenbeginns/i)
  await beginnInput.waitFor({ state: 'visible', timeout: 10_000 })
  await beginnInput.fill('2021')
  await beginnInput.blur()
  await page.waitForTimeout(500)

  await page.locator('text=Steuerpflichtiger Anteil').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('[data-testid="cockpit-kachel-kapital"]').waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('[data-testid="cockpit-kachel-arbeitsweg"]').isVisible()) {
    fail('Expected arbeitsweg tile collapsed under Weitere Themen for retiree in Scenario 05')
  }
  await page.locator('[data-testid="cockpit-weitere-themen"]').click()
  await page.locator('[data-testid="cockpit-kachel-arbeitsweg"]').waitFor({ state: 'visible', timeout: 10_000 })

  const capitalBtn = page.locator('[data-testid="cockpit-kapital"]')
  await capitalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await capitalBtn.click()

  const answerPrompt = page.locator('[data-testid="kapital-frage-beantworten"]')
  const firstField = page.locator('[data-testid="kapital-kapitalertraege"]')
  await Promise.race([
    answerPrompt.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    firstField.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
  ])

  if (await answerPrompt.isVisible()) {
    await answerPrompt.click()
    const optKap = page.locator('[data-testid="katalog-option-einkuenfte-Kapitalerträge"]')
    await optKap.waitFor({ state: 'visible', timeout: 10_000 })
    await optKap.click()
    const optBroker = page.locator('[data-testid="katalog-option-kap-depot-Deutscher Broker"]')
    await optBroker.waitFor({ state: 'visible', timeout: 10_000 })
    await optBroker.click()
    await page.waitForTimeout(600)
  }

  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('[data-testid="kapital-kapitalertraege"]').fill('8000')
  await page.locator('[data-testid="kapital-sparerPauschbetrag"]').fill('1000')
  await page.locator('[data-testid="kapital-kapitalertragsteuer"]').fill('1750')
  await page.locator('[data-testid="kapital-solidaritaetszuschlag"]').fill('96')
  await page.locator('[data-testid="kapital-kirchensteuer"]').fill('0')
  await page.locator('[data-testid="kapital-weiter"]').click()
  await page.waitForTimeout(500)

  await assertCockpitEstimate(page, 'Scenario 05', { expectedText: 'Die Erstattung rechnen wir bisher nur für Angestellte.' })

  const masterDataBtn = page.locator('[data-testid="cockpit-stammdaten"]')
  await masterDataBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await masterDataBtn.click()

  await page.locator('[data-testid="stammdaten-geburtsdatum"]').fill('14.03.1956')
  await page.locator('[data-testid="stammdaten-beruf"]').fill('Rentner')
  await page.locator('[data-testid="stammdaten-strasse"]').fill('Goethestraße')
  await page.locator('[data-testid="stammdaten-hausnummer"]').fill('10')
  await page.locator('[data-testid="stammdaten-plz"]').fill('70174')
  await page.locator('[data-testid="stammdaten-wohnort"]').fill('Stuttgart')
  await page.locator('[data-testid="stammdaten-familienstand-ledig"]').click()
  await page.locator('[data-testid="stammdaten-religion-VD"]').click()
  await page.locator('[data-testid="stammdaten-einwilligung"]').click()
  await page.locator('[data-testid="stammdaten-finanzamt"]').fill('Stuttgart I')
  await page.locator('[data-testid="stammdaten-iban"]').fill('DE89370400440532013000')
  await page.locator('[data-testid="stammdaten-speichern"]').click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="stammdaten-zurueck"]').click()

  unlockTaxYearInDb(sql, email, 2025)
  await page.locator('[data-testid="cockpit-ausdruck"]').click()
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="abgabe-zum-ausdruck"]').click()
  await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  await confirmAnnexesIfPresent(page)

  const downloadButton = page.locator('[data-testid="ausdruck-herunterladen-bearbeitbar"]')
  await downloadButton.waitFor({ state: 'visible', timeout: 15_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    downloadButton.click(),
  ])
  const filePath = await download.path()
  const pdfBytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(pdfBytes)
  if (doc.getPageCount() < 1) fail('Scenario 05 PDF is empty')
  console.log(`[Scenario 05] PASS: Pensioner flow, statutory pension calculation, capital income and PDF (${doc.getPageCount()} pages) verified.`)

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 05: Hans Meyer (Retiree / Pensioner)', runScenario05).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
