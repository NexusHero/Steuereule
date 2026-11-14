// Scenario 19: Deep Dialog Matrix — Minimal-Gate Interview Zig-Zag & Gate Recovery
// Tests all branches, terminal/passable gates on the Strom's basis page (ADR-0089), Back/Forward
// through the Strom and the deselect confirmation on its selection page.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  chooseTopics,
  fillTopic,
  leaveStrom,
  waitForStromStep,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario19(browser, webOrigin) {
  console.log('\n--- Scenario 19: Dialog Matrix — Minimal-Gate Interview Zig-Zag & Gate Recovery ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+matrix.interview.${Date.now()}@beispiel.de`,
      firstName: 'klara',
      lastName: 'Zickzack',
      taxId: '04452397686',
    },
    webOrigin,
    'scenario-19',
  )

  await selectTaxYear2025(page)
  await page.locator('[data-testid="cockpit-interview"]').click()

  // The Strom's basis page (ADR-0089) holds the whole Minimal-Gate: every answer change opens or
  // closes the questions and notices behind it in place, instead of a page per question.
  await waitForStromStep(page, 'basis')
  const opt = (id, value) => page.locator(`[data-testid="interview-option-${id}-${value}"]`)
  const field = (id) => page.locator(`[data-testid="strom-feld-${id}"]`)
  const gewerbe = page.locator('[data-testid="strom-hinweis-gewerbe"]')
  const chOnly = page.locator('[data-testid="strom-hinweis-ch-only"]')

  // 1. Job = Selbstständig -> terminal Gewerbe-Gate, nothing after it.
  await opt('job', 'Selbstständig').click()
  await gewerbe.locator('text=Ehrlich: dafür sind wir noch nicht gut genug.').waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('text=Angestellten-Teil vorbereiten').isVisible()) {
    fail('[Scenario 19] Terminal Gewerbe-Gate must not show forward button for Selbstständig')
  }
  if (await field('ausland').isVisible()) fail('[Scenario 19] The terminal Gewerbe-Gate must hide the questions after it')

  // 2. Job = Beides -> passable Gewerbe-Gate with the remaining questions below it.
  await opt('job', 'Beides').click()
  await gewerbe.waitFor({ state: 'visible', timeout: 10_000 })
  await field('ausland').waitFor({ state: 'visible', timeout: 10_000 })

  // 3. Job = Rente -> no gate; then Angestellt.
  await opt('job', 'Rente').click()
  await gewerbe.waitFor({ state: 'detached', timeout: 10_000 })
  await field('ausland').waitFor({ state: 'visible', timeout: 10_000 })
  await opt('job', 'Angestellt').click()

  // 4. Ausland = In ein anderes Land -> CH-Only notice inline; Schweiz -> no notice; Nein.
  await opt('ausland', 'In ein anderes Land').click()
  await chOnly.locator('text=Ehrlich: andere Länder können wir noch nicht.').waitFor({ state: 'visible', timeout: 10_000 })
  await field('kinder').waitFor({ state: 'visible', timeout: 10_000 })
  await opt('ausland', 'Ja, in die Schweiz').click()
  await chOnly.waitFor({ state: 'detached', timeout: 10_000 })
  await opt('ausland', 'Nein').click()

  // 5. Kinder 2 oder mehr / 1 Kind / Nein; Verheiratet opens the partner's questions, Ledig closes them.
  await opt('kinder', '2 oder mehr').click()
  await opt('kinder', '1 Kind').click()
  await opt('kinder', 'Nein').click()
  // Weiter with the marital status still open names what is missing and stays on the page.
  await page.locator('[data-testid="strom-weiter"]').click()
  await page.locator('[data-testid="strom-fehlt-familienstand"]').waitFor({ state: 'visible', timeout: 10_000 })
  await waitForStromStep(page, 'basis')
  await opt('familienstand', 'Verheiratet').click()
  await field('partner-job').waitFor({ state: 'visible', timeout: 10_000 })
  await opt('familienstand', 'Geschieden oder getrennt').click()
  await field('partner-job').waitFor({ state: 'detached', timeout: 10_000 })
  await opt('familienstand', 'Ledig').click()
  await page.locator('[data-testid="strom-position"]', { hasText: 'Schritt 1 von' }).waitFor({ state: 'visible', timeout: 10_000 })

  // Complete -> the Strom continues with the wage certificate.
  await page.locator('[data-testid="strom-weiter"]').click()
  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-position"]', { hasText: 'Schritt 2 von' }).waitFor({ state: 'visible', timeout: 10_000 })

  // 6. Back and forth through the Strom: the mask's own back returns to the basis, which keeps its answers.
  await page.getByRole('button', { name: 'Zurück', exact: true }).first().click()
  await waitForStromStep(page, 'basis')
  if ((await opt('familienstand', 'Ledig').getAttribute('aria-pressed')) !== 'true') fail('[Scenario 19] The basis page lost its answer on the way back')
  await page.locator('[data-testid="strom-weiter"]').click()
  await waitForStromStep(page, 'lohnsteuerbescheinigung')
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('50000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('8000')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('10000')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await waitForStromStep(page, 'arbeitsweg')
  await page.locator('[data-testid="arbeitstage-km"]').fill('10')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  // 7. Selection zig-zag: two topics, back from the second page to the first and to the selection,
  // deselect a topic that already holds an amount -> asked first; „Nein“ keeps it, „Ja“ drops it.
  await chooseTopics(page, ['riester', 'spenden'])
  await fillTopic(page, 'riester', { 'riester-betrag': 600, 'riester-art': 'Unmittelbar', 'riester-einnahmen-vorjahr': 48000 })
  await waitForStromStep(page, 'spenden')
  await page.locator('[data-testid="strom-zurueck"]').click()
  await waitForStromStep(page, 'riester')
  if ((await page.locator('[data-testid="katalog-input-riester-betrag"]').inputValue()) !== '600') fail('[Scenario 19] The Riester page lost its amount on the way back')
  await page.locator('[data-testid="strom-zurueck"]').click()
  await waitForStromStep(page, 'auswahl')
  await page.locator('[data-testid="strom-thema-riester"]').click()
  await page.locator('[data-testid="strom-weiter"]').click()
  await page.locator('[data-testid="strom-abwaehlen"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="strom-abwaehlen-nein"]').click()
  await page.locator('[data-testid="strom-abwaehlen"]').waitFor({ state: 'detached', timeout: 10_000 })
  await waitForStromStep(page, 'auswahl')
  await page.locator('[data-testid="strom-weiter"]').click()
  await page.locator('[data-testid="strom-abwaehlen-ja"]').click()

  // A save that fails keeps the page with its amount and says so; the next Weiter goes through.
  await waitForStromStep(page, 'spenden')
  await page.locator('[data-testid="katalog-input-spenden-betrag"]').fill('250')
  const failAnswers = (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue())
  await page.route(/\/interview\/antworten$/, failAnswers)
  await page.locator('[data-testid="strom-weiter"]').click()
  await page.locator('[data-testid="strom-speicherfehler"]').waitFor({ state: 'visible', timeout: 10_000 })
  await waitForStromStep(page, 'spenden')
  await page.unroute(/\/interview\/antworten$/, failAnswers)
  await fillTopic(page, 'spenden', { 'spenden-betrag': 250 })
  await waitForStromStep(page, 'fertig')
  if (await page.locator('[data-testid="strom-uebernommen-riester"]').isVisible()) fail('[Scenario 19] A deselected topic must leave the summary')
  await page.locator('[data-testid="strom-uebernommen-spenden"]').waitFor({ state: 'visible', timeout: 10_000 })
  await leaveStrom(page)

  console.log('[Scenario 19] PASS: All basis branches, gates, Strom back/forward and the deselect confirmation verified.')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 19: Dialog Matrix — Interview Zig-Zag', runScenario19).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
