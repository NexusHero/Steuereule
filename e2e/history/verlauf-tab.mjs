// ADR-0098 — the tab „Verlauf“, end to end in the real app: the tab bar `Cockpit · Eule · Belege ·
// Verlauf · Profil`, the old year-list links landing in the Verlauf, „Was ansteht“, the summary, the
// years (list on the phone, table on the desktop) and the Bescheid-Abgleich under the picked year, the
// four key figures with tiers, the person toggle and the data table, the upload entry into the one Beleg
// pipeline, the same Abgleich in „Bescheid prüfen“, the lesson at the next year's mask, and „Ich habe
// die Erklärung abgegeben“ in the cockpit.
//
// `GET /v1/verlauf` and the reading of the Bescheid are served here (route mocks with the API's
// response shape, the mock's example household from `fixtures/year-history.json`), so the row tests the
// app, not a seeded multi-year history; the Abgabe goes to the real server.
//
// Run against a running stack in ATTACH mode (API_ORIGIN, WEB_ORIGIN, DATABASE_URL set).
import { readFileSync } from 'node:fs'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { skipSplash } from '../harness/flows.mjs'
import { createAccount, answer, browserLogin, call, until } from '../harness/api-account.mjs'
import { renderTextPdf } from '../fixtures/synthetic-documents.mjs'

const TAG = 'verlauf-tab'
const YEAR = 2025
const HISTORY = JSON.parse(readFileSync(new URL('../fixtures/year-history.json', import.meta.url), 'utf8'))
const EMPTY = { today: HISTORY.today, years: [], list: [], openItems: [], diffs: [], maskLessons: null }
const DIFF_2024 = HISTORY.diffs.find((d) => d.year === 2024)

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** The reading of an old Bescheid (ADR-0098 §4): what was read, what not, and the Eckjahr it creates. */
const BESCHEID_READ = {
  mode: 'deterministic_fallback',
  securityBlocked: false,
  parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: 2020 },
  stagedAction: null,
  assistantMessage: null,
  draftsTaxYear: 2020,
  filedInTaxYear: 2020,
  noValuesReason: null,
  duplicateOf: null,
  processing: { state: 'vorschlaege', reason: null, pending: 3, applied: 0, dismissed: 0, draftsTaxYear: 2020, open: true },
  assessmentNotice: {
    receiptId: null,
    taxYearOnDocument: 2020,
    assessmentDate: '2021-06-14',
    read: ['festgesetzteSteuer', 'erstattung'],
    notRead: ['bruttoarbeitslohnA'],
    explanations: 0,
    createsEckjahr: true,
    stagedActionIds: ['e2e-1', 'e2e-2', 'e2e-3'],
  },
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    // --- A guest: the Verlauf asks for an account ---------------------------------------------------
    const guestCtx = await newContextAtBreakpoint(browser, 's')
    const guest = await guestCtx.newPage()
    await skipSplash(guest, webOrigin)
    await guest.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    for (const id of ['verlauf-gast', 'verlauf-gast-registrieren', 'verlauf-gast-anmelden']) {
      await guest.locator(`[data-testid="${id}"]`).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(`${id} should be visible for a guest`))
    }
    await guestCtx.close()
    console.log(`[${TAG}] ✅ Guest — the Verlauf asks for an account instead of showing numbers`)

    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])

    // --- Phone ----------------------------------------------------------------------------------------
    const ctx = await newContextAtBreakpoint(browser, 's')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    const byId = (id) => page.locator(`[data-testid="${id}"]`)
    const see = async (id, timeout = 15_000) => byId(id).waitFor({ state: 'visible', timeout }).catch(() => fail(`${id} should be visible`))
    const textOf = async (id) => (await byId(id).innerText()).replace(/ /g, ' ')

    let history = HISTORY
    await page.route('**/v1/verlauf', (route) => route.fulfill(json(history)))

    // The tab bar has the fifth tab, and it opens the Verlauf.
    await page.getByRole('tab', { name: 'Verlauf' }).click()
    await page.waitForURL((u) => u.pathname === '/app/verlauf', { timeout: 10_000 })
    await see('verlauf-titel')
    // An old link to the year list lands in the Verlauf (`linking.ts` aliases).
    await page.goto(`${webOrigin}/app/steuerjahre`, { waitUntil: 'networkidle' })
    await see('verlauf-titel')
    console.log(`[${TAG}] ✅ Tab „Verlauf“ — in the tab bar, and /app/steuerjahre lands there`)

    // What is due, most urgent first.
    await see('verlauf-ansteht')
    const due = await page.locator('[data-testid^="verlauf-ansteht-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    if (due.join() !== 'verlauf-ansteht-2024,verlauf-ansteht-2025,verlauf-ansteht-2026') fail(`„Was ansteht“ should start with the deadline of 2024, it is ${due.join()}`)
    if (!(await textOf('verlauf-ansteht-2024')).includes('Bescheid weicht ab: −92 €')) fail('the deadline item should name the cut in euros')
    await see('verlauf-held')
    if ((await textOf('verlauf-held-erstattet')) !== '+1.632 €') fail('the summary should add the refunds of the Bescheid years')
    if ((await textOf('verlauf-held-geaendert')) !== '−92 €') fail('the summary should say what the Finanzamt changed')
    console.log(`[${TAG}] ✅ Was ansteht and the summary — deadline first with euros and days`)

    // The years, and the Abgleich of the highlighted year below them.
    await see('verlauf-jahre')
    await see('verlauf-jahr-2024')
    await see('verlauf-abgleich-2024')
    if ((await textOf('verlauf-abgleich-2024-anzahl')) !== '2 Abweichungen') fail('the Abgleich of 2024 should count two deviations')
    const rows = await page.locator('[data-testid^="verlauf-abgleich-2024-zeile-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    if (rows[0] !== 'verlauf-abgleich-2024-zeile-homeofficeA') fail(`the largest effect should come first, the rows are ${rows.join()}`)
    await see('verlauf-abgleich-2024-frist')
    await see('verlauf-abgleich-2024-kette')
    await see('verlauf-abgleich-2024-nichtlinear')
    await see('verlauf-abgleich-2024-lehren')
    await byId('verlauf-abgleich-2024-formular').click()
    await see('verlauf-abgleich-2024-formularansicht')
    console.log(`[${TAG}] ✅ Bescheid-Abgleich — only the changes first, the chain, the deadline, the lessons, the form view on demand`)

    await byId('verlauf-jahr-2023').click()
    await see('verlauf-abgleich-2023-gleich')
    await see('verlauf-abgleich-2023-frist-vorbei')
    await see('verlauf-zum-cockpit-2023')
    await byId('verlauf-jahr-2021').click()
    await see('verlauf-jahr-panel-2021')
    if (!(await textOf('verlauf-ohne-abgleich-2021-grund')).startsWith('Kein Abgleich: Die Erklärung 2021 wurde nicht in SteuerEule gemacht.')) fail('an Eckjahr should say why there is no Abgleich')
    await byId('verlauf-jahr-2025').click()
    await see('verlauf-ohne-abgleich-2025')
    if ((await textOf('verlauf-ohne-abgleich-2025')).includes('€')) fail('a year waiting for its Bescheid must not name an amount')
    await byId('verlauf-ohne-abgleich-2025-schliessen').click()
    await byId('verlauf-ohne-abgleich-2025').waitFor({ state: 'detached', timeout: 5_000 })
    console.log(`[${TAG}] ✅ Years without a diff — „wie erklärt“, the Eckjahr sentence, the waiting year without an amount`)

    // The development: refund first, person toggle, the other key figures, the data table.
    await see('verlauf-karte')
    await see('verlauf-diagramm')
    await see('verlauf-diagramm-svg')
    await see('verlauf-eule')
    if ((await textOf('verlauf-karte-titel')) !== 'Erstattung und Nachzahlung') fail('the development should open with the refund')
    await see('verlauf-person')
    await byId('verlauf-person-B').click()
    await see('verlauf-hinweis-haushalt')
    await byId('verlauf-kennzahl-netto').click()
    if ((await textOf('verlauf-karte-titel')) !== 'Vom Brutto zum Netto · Person B') fail('Brutto → Netto should follow the person toggle')
    await byId('verlauf-person-beide').click()
    await byId('verlauf-diagramm-jahr-2021').click()
    await see('verlauf-detail')
    await see('verlauf-detail-lstb')
    await byId('verlauf-diagramm-jahr-2024').click()
    await see('verlauf-detail-netto')
    await byId('verlauf-kennzahl-erstattung').click()
    await see('verlauf-detail-erstattung')
    await byId('verlauf-detail-abgleich').click()
    await see('verlauf-abgleich-2024')
    await byId('verlauf-datentabelle-umschalten').click()
    await see('verlauf-datentabelle')
    console.log(`[${TAG}] ✅ Development — refund first, person toggle only where it applies, detail per year, data table behind the chart`)

    // The upload entry: the one Beleg pipeline with the kind `steuerbescheid`.
    let parseBody = null
    await page.route('**/v1/belege/parse', async (route) => {
      const body = route.request().postDataJSON()
      if (body.deviceReadFailure !== undefined) return route.continue()
      parseBody = body
      return route.fulfill(json(BESCHEID_READ))
    })
    await see('verlauf-upload')
    const pdf = await renderTextPdf(browser, ['Bescheid für 2020 über Einkommensteuer', 'Festgesetzt werden Einkommensteuer 6.410,00 EUR', 'Erstattung 280,00 EUR'])
    await byId('verlauf-upload-datei').setInputFiles({ name: 'bescheid-2020.pdf', mimeType: 'application/pdf', buffer: pdf })
    await see('verlauf-upload-bescheid', 60_000)
    await see('verlauf-upload-nicht-gelesen')
    await see('verlauf-upload-eckjahr')
    if (parseBody?.kind !== 'steuerbescheid' || parseBody?.expectedKind !== 'steuerbescheid') fail(`the Verlauf upload should read as \`steuerbescheid\`, it sent ${JSON.stringify(parseBody?.kind)}`)
    await until(async () => (await call(api, 'GET', '/v1/belege')).some((r) => r.fileName === 'bescheid-2020.pdf' && r.kind === 'Steuerbescheid'), true, 'the Bescheid should be stored in the Belege tab as a Steuerbescheid', 30_000)
    await page.unroute('**/v1/belege/parse')
    console.log(`[${TAG}] ✅ Upload — same pipeline as the Belege tab, the reading says what it read, what not, and that an Eckjahr comes`)

    // „Einspruch vorbereiten“ leads into the year's Bescheidprüfung, which shows the same Abgleich.
    await page.route('**/v1/steuerjahre/2024/bescheid', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const real = await (await route.fetch()).json()
      return route.fulfill(json({ ...real, assessmentDate: '2026-11-02', frist: { assessmentDate: '2026-11-02', deadlineEnd: '2026-12-07', remainingDays: 19, running: true }, diff: DIFF_2024.diff }))
    })
    await byId('verlauf-abgleich-2024-einspruch').click()
    await page.waitForURL((u) => u.pathname === '/app/steuerjahr/2024/bescheid', { timeout: 10_000 })
    await see('bescheid-abgleich')
    await see('bescheid-abgleich-frist')
    await page.unroute('**/v1/steuerjahre/2024/bescheid')
    console.log(`[${TAG}] ✅ „Einspruch vorbereiten“ — opens „Bescheid prüfen“ of 2024 with the same Abgleich`)

    // The lesson at the mask of the next open year.
    await page.goto(`${webOrigin}/app/steuerjahr/2026/arbeitstage`, { waitUntil: 'networkidle' })
    await see('maske-lehre-homeOfficeDays')
    if (!(await textOf('maske-lehre-homeOfficeDays')).includes('180 statt 210 Homeoffice-Tage')) fail('the home office mask should carry the 2024 lesson')
    console.log(`[${TAG}] ✅ Lessons — the home office mask of 2026 carries what 2024's Bescheid recognised`)

    // Honest states: an error and an empty history.
    history = null
    await page.unroute('**/v1/verlauf')
    await page.route('**/v1/verlauf', (route) => route.fulfill(json({ message: 'boom' }, 500)))
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await see('verlauf-fehler')
    await page.unroute('**/v1/verlauf')
    await page.route('**/v1/verlauf', (route) => route.fulfill(json(EMPTY)))
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await see('verlauf-leer')
    await see('verlauf-upload')
    await page.unroute('**/v1/verlauf')
    console.log(`[${TAG}] ✅ States — an error says so with a retry, an empty history says so and offers the upload`)
    await ctx.close()

    // --- Desktop ------------------------------------------------------------------------------------
    const wide = await newContextAtBreakpoint(browser, 'l')
    const desk = await wide.newPage()
    guardAgainst429(desk, fail, '/api/auth/')
    await browserLogin(desk, webOrigin, user.email, TAG)
    await desk.route('**/v1/verlauf', (route) => route.fulfill(json(HISTORY)))
    await desk.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    const deskId = (id) => desk.locator(`[data-testid="${id}"]`)
    for (const id of ['verlauf-tabelle', 'verlauf-tabelle-2024', 'verlauf-kpi-erstattung']) {
      await deskId(id).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(`${id} should be visible on the desktop`))
    }
    if (await deskId('verlauf-jahre').count()) fail('the desktop shows the table, not the phone list')
    await deskId('verlauf-kpi-werbungskosten').click()
    if (((await deskId('verlauf-karte-titel').innerText()) ?? '').trim() !== 'Werbungskosten je Jahr') fail('a KPI tile should pick its key figure')
    await deskId('verlauf-tabelle-2023').click()
    await deskId('verlauf-abgleich-2023').waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Desktop — the table „Alle Jahre: erklärt und festgesetzt“, KPI tiles pick the key figure`)

    // „Ich habe die Erklärung abgegeben“ in the cockpit after printing, and its undo (real server).
    await desk.unroute('**/v1/verlauf')
    await desk.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await deskId('cockpit-abgabe-marke').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('the cockpit should offer to mark the return as filed'))
    await deskId('cockpit-abgabe-datum').fill('10.03.2026')
    await deskId('cockpit-abgabe-abgegeben').click()
    await deskId('cockpit-abgabe-marke-stand').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('the filed year should say so'))
    if (!(await deskId('cockpit-abgabe-marke-stand').innerText()).includes('10.03.2026')) fail('the cockpit should name the day of filing')
    await desk.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await deskId(`verlauf-tabelle-${YEAR}`).waitFor({ state: 'visible', timeout: 15_000 })
    if (!(await deskId(`verlauf-tabelle-${YEAR}`).innerText()).includes('Schätzung') && !(await deskId(`verlauf-tabelle-${YEAR}`).innerText()).includes('offen')) fail('the filed year should be in the Verlauf')
    await desk.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await deskId('cockpit-abgabe-zuruecknehmen').click()
    await deskId('cockpit-abgabe-marke-status').waitFor({ state: 'visible', timeout: 15_000 })
    await deskId('cockpit-abgabe-abgegeben').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('after the undo the cockpit should offer the button again'))
    console.log(`[${TAG}] ✅ Cockpit — „Ich habe die Erklärung abgegeben“ marks ${YEAR} as filed, „Abgabe zurücknehmen“ undoes it`)

    await wide.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — the Verlauf tab, its Abgleich, charts, upload entry, lessons and the Abgabe verified (ADR-0098).`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
