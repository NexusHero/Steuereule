// Scenario 08: Exhaustive Navigation, Guest Flow, Profile, Security, Privacy, Legal, Device & Responsive Breakpoints
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  skipSplash,
  registerAndOnboard,
  selectTaxYear2025,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario08(browser, webOrigin) {
  console.log('\n--- Scenario 08: Exhaustive Navigation, Every Screen, Back Buttons, Settings & Viewports ---')

  const guestCtx = await newContextAtBreakpoint(browser, 'm')
  const guestPage = await guestCtx.newPage()
  await skipSplash(guestPage, webOrigin)

  const guestButton = guestPage.locator('[data-testid="login-guest-link"]')
  await guestButton.waitFor({ state: 'visible', timeout: 10_000 })
  await guestButton.click()

  await guestPage.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
  await guestPage.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await guestPage.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await guestPage.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await guestPage.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  await guestPage.locator('text=Dein Weg:').waitFor({ state: 'visible', timeout: 10_000 })
  await guestPage.locator('[data-testid="konto-wand-spaeter"]').click()
  await guestPage.locator('[data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  await guestCtx.close()

  const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+qa.deep.${Date.now()}@beispiel.de`,
      firstName: 'Maximilian',
      lastName: 'Mustermann',
      taxId: '10234567890',
    },
    webOrigin,
    'scenario-08',
  )

  await selectTaxYear2025(page)

  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('text=Mandantengeheimnis aktiv').waitFor({ state: 'visible', timeout: 10_000 })

  await page.getByRole('tab', { name: 'Belege' }).click()
  await page.locator('text=Beleg hochladen (PDF / Foto)').waitFor({ state: 'visible', timeout: 10_000 })

  await page.getByRole('tab', { name: 'Profil' }).click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('text=Angaben für die Steuererklärung').click()
  await page.locator('[data-testid="stammdaten-geburtsdatum"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="stammdaten-zurueck"]').click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('text=Sicherheit (Zwei-Faktor)').click()
  const twoFaButton = page.locator('text=Zwei-Faktor aktivieren')
  await twoFaButton.waitFor({ state: 'visible', timeout: 10_000 })
  await twoFaButton.click()
  await page.locator('text=Passwort bestätigen').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=←').first().click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('text=So schützen wir deine Daten (DSGVO)').click()
  const exportJsonBtn = page.locator('text=Als JSON herunterladen')
  await exportJsonBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Als PDF-Bericht herunterladen').waitFor({ state: 'visible', timeout: 10_000 })

  await page.locator('text=Konto & Daten löschen').click()
  const cancelDeleteBtn = page.locator('text=Abbrechen').first()
  await cancelDeleteBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await cancelDeleteBtn.click()
  await exportJsonBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=←').first().click()
  await page.locator('text=Maximilian Mustermann').waitFor({ state: 'visible', timeout: 10_000 })

  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 10_000 })

  const bescheidBtn = page.locator('[data-testid="cockpit-bescheid"]')
  await bescheidBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await bescheidBtn.click()
  await page.locator('text=Dein Steuerbescheid').waitFor({ state: 'visible', timeout: 10_000 })
  const steuerFeld = page.getByLabel(/Festgesetzte Einkommensteuer/i)
  if (await steuerFeld.count()) {
    await steuerFeld.fill('15000')
    await steuerFeld.blur()
  }
  await page.locator('text=←').first().click()
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })

  const rentalBtn = page.locator('[data-testid="cockpit-vermietung"]')
  await rentalBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await rentalBtn.click()
  await page.locator('text=Deine Vermietung').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=←').first().click()
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })

  await page.goto(`${webOrigin}/rechtliches/impressum`, { waitUntil: 'networkidle' })
  await page.locator('text=Angaben gemäß § 5 DDG').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Datenschutzerklärung').last().click()
  await page.locator('text=1. Verantwortlicher').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=AGB & Widerruf').last().click()
  await page.locator('text=§ 1 Geltungsbereich').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=Wichtige Hinweise').last().click()
  await page.locator('text=Keine Steuerberatung').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('text=←').first().click()
  await page.waitForTimeout(500)

  await page.goto(`${webOrigin}/device`, { waitUntil: 'networkidle' })
  await page.locator('text=Kein Code angegeben').waitFor({ state: 'visible', timeout: 10_000 })
  await page.goto(`${webOrigin}/device?user_code=TEST-1234`, { waitUntil: 'networkidle' })
  await page.locator('text=Code ungültig oder abgelaufen').waitFor({ state: 'visible', timeout: 10_000 })

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  }

  // Browser history check across full page loads: goto + reload + goBack returns to Cockpit
  await page.goto(`${webOrigin}/app/steuerjahr/2025/kapital`, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="kapital-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-testid="kapital-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.goBack({ waitUntil: 'networkidle' })
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  // In-app navigation check: clicking Cockpit tile pushes /kapital and goBack pops to Cockpit
  await page.locator('[data-testid="cockpit-kapital"]').click()
  await page.locator('[data-testid="kapital-weiter"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.goBack()
  await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-bescheid"]').first().waitFor({ state: 'visible', timeout: 10_000 })

  console.log('\n[Scenario 08] PASS: Exhaustive navigation, all pages, subviews, settings, and back buttons verified.')
  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 08: Exhaustive Navigation & Guest Funnel', runScenario08).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
