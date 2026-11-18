// ADR-0098 — the tab „Verlauf“ as a timeline (alternative A), end to end in the real app: the tab bar
// `Cockpit · Eule · Belege · Verlauf · Profil`, the old year-list links landing in the Verlauf, „Jetzt
// wichtig“ in the cockpit's dark block, one row per year, a year's own page (`/app/verlauf/:jahr`) with
// the Bescheid-Abgleich as a receipt (deadline chip, lessons inside the rows), back to the tab, „Entwicklung ansehen“
// (`/app/verlauf/entwicklung`) with the four key figures, tiers, the person toggle and the data table,
// the upload entry behind „Ältere Jahre ergänzen“ into the one Beleg pipeline, the same Abgleich in
// „Bescheid prüfen“, the lesson at the next year's mask, and „Ich habe die Erklärung abgegeben“ in the
// cockpit.
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

    const atPath = (path) => page.waitForURL((u) => u.pathname === path, { timeout: 10_000 })

    // „Jetzt wichtig“: only the most urgent item, in the cockpit's dark block, the rest as one line.
    await see('verlauf-jetzt')
    const now = await textOf('verlauf-jetzt-inhalt')
    if (!now.includes('2024: Das Finanzamt hat gekürzt') || !now.includes('−92 €') || !now.includes('Einspruch noch 19 Tage möglich')) fail(`„Jetzt wichtig“ should name the cut of 2024 and its days, it says ${now}`)
    if ((await textOf('verlauf-jetzt-weitere')) !== '+ 2 weitere Jahre brauchen dich') fail('the other due years should be one quiet line')
    for (const gone of ['verlauf-held', 'verlauf-ansteht', 'verlauf-abgleich-2024', 'verlauf-karte']) {
      if (await byId(gone).count()) fail(`${gone} no longer belongs on the tab`)
    }
    await byId('verlauf-jetzt-weitere').click()
    await see('verlauf-jahre')
    console.log(`[${TAG}] ✅ Jetzt wichtig — the deadline of 2024 with euros and days, the rest as one line, no summary, no Abgleich, no chart on the tab`)

    // One row per year, newest first: one phrase, one amount.
    const years = await page.locator('[data-testid^="verlauf-jahr-20"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    if (years.join() !== 'verlauf-jahr-2026,verlauf-jahr-2025,verlauf-jahr-2024,verlauf-jahr-2023,verlauf-jahr-2022,verlauf-jahr-2021') fail(`the timeline should list the years newest first, it is ${years.join()}`)
    if (!(await textOf('verlauf-jahr-2024')).includes('Bescheid · 92 € weniger als erklärt')) fail('the cut year should say how much less came back')
    if (!(await textOf('verlauf-jahr-2025')).includes('+1.066–1.196 €')) fail('the waiting year should show its estimate as a range')
    if (!(await textOf('verlauf-jahr-2021')).includes('nur Bescheid')) fail('a year with only its Bescheid should say so')
    await see('verlauf-entwicklung')
    await see('verlauf-aeltere')
    console.log(`[${TAG}] ✅ Timeline — one row per year with one phrase and one amount, a range stays a range`)

    // „Ansehen“ opens the year's page with the Bescheid-Abgleich; back returns to the tab.
    await byId('verlauf-jetzt-ansehen').click()
    await atPath('/app/verlauf/2024')
    if ((await textOf('verlauf-jahr-titel')) !== '2024') fail('the year page should be titled by its year')
    if (!(await textOf('verlauf-jahr-satz')).includes('2 Positionen geändert')) fail('the year page should say in one sentence what the Finanzamt did')
    await see('verlauf-abgleich-2024')
    // The receipt (ADR-0098 §8): one figure, the deadline chip, one row per change; collapsed it fits one phone screen.
    const receipt = await byId('verlauf-abgleich-2024').boundingBox()
    if (receipt === null || receipt.height > 700) fail(`the collapsed Abgleich should fit one phone screen, it is ${receipt?.height} px high`)
    if ((await page.getByRole('heading', { name: /Erklärung ↔ Bescheid/ }).count()) > 0) fail('the year page should not repeat a title in the Abgleich')
    if ((await textOf('verlauf-abgleich-2024-wirkung')) !== '−92 €') fail('the receipt should head with the total effect on the refund')
    for (const gone of ['verlauf-abgleich-2024-anzahl', 'verlauf-abgleich-2024-kette', 'verlauf-abgleich-2024-lehren', 'verlauf-abgleich-2024-spalten']) {
      if (await byId(gone).count()) fail(`${gone} belongs to the old diff, not to the receipt`)
    }
    const rows = await page.locator('[data-testid^="verlauf-abgleich-2024-zeile-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    if (rows[0] !== 'verlauf-abgleich-2024-zeile-homeofficeA') fail(`the largest effect should come first, the rows are ${rows.join()}`)
    const homeRow = await textOf('verlauf-abgleich-2024-zeile-homeofficeA')
    if (!homeRow.includes('180 statt 210 Tage') || !homeRow.includes('2025 wieder 210 erklärt')) fail(`the row should carry its short reason and the next year, it says ${homeRow}`)
    if (!(await textOf('verlauf-abgleich-2024-einspruch')).startsWith('Einspruch · 19 Tage')) fail('the deadline chip should name the days left')
    if (await byId('verlauf-abgleich-2024-nichtlinear').count()) fail('the note on the sum should wait behind its info icon')
    await byId('verlauf-abgleich-2024-nichtlinear-umschalten').click()
    await see('verlauf-abgleich-2024-nichtlinear')
    if (await byId('verlauf-abgleich-2024-detail-homeofficeA').count()) fail('a row should start collapsed')
    await byId('verlauf-abgleich-2024-zeile-homeofficeA').getByRole('button').click()
    await see('verlauf-abgleich-2024-detail-homeofficeA')
    if (!(await textOf('verlauf-abgleich-2024-detail-homeofficeA')).includes('„Die Tätigkeit in der häuslichen Wohnung')) fail('an opened row should quote the Finanzamt')
    if (await byId('verlauf-abgleich-2024-formularansicht').count()) fail('the form view should start collapsed')
    await byId('verlauf-abgleich-2024-formular').click()
    await see('verlauf-abgleich-2024-formularansicht')
    await see('verlauf-zum-cockpit-2024')
    await byId('verlauf-jahr-zurueck').click()
    await atPath('/app/verlauf')
    await see('verlauf-jetzt')
    console.log(`[${TAG}] ✅ Year page — /app/verlauf/2024 with the receipt: one figure, the deadline chip, rows with short reasons opening to quote and lesson, the form view on demand; back returns to the tab`)

    // The other kinds of years, each on its own page.
    await byId('verlauf-jahr-2023').click()
    await atPath('/app/verlauf/2023')
    await see('verlauf-abgleich-2023-gleich')
    await see('verlauf-abgleich-2023-frist-vorbei')
    if ((await textOf('verlauf-jahr-wechsel')) !== 'ab 2023 zusammen veranlagt') fail('the change of the filing type belongs on the year page')
    await byId('verlauf-jahr-zurueck').click()
    await atPath('/app/verlauf')
    await page.goto(`${webOrigin}/app/verlauf/2022`, { waitUntil: 'networkidle' })
    await see('verlauf-abgleich-2022-A')
    await see('verlauf-abgleich-2022-B')
    await page.goto(`${webOrigin}/app/verlauf/2021`, { waitUntil: 'networkidle' })
    if (!(await textOf('verlauf-jahr-satz')).startsWith('Nur der Bescheid: Die Erklärung 2021 wurde nicht in SteuerEule gemacht')) fail('a year with only its Bescheid should say why there is no Abgleich')
    if (await byId('verlauf-zum-cockpit-2021').count()) fail('2021 is no selectable year, so no way into its cockpit')
    await page.goto(`${webOrigin}/app/verlauf/2025`, { waitUntil: 'networkidle' })
    await see('verlauf-wartet-2025')
    if ((await textOf('verlauf-wartet-2025')).includes('€')) fail('a year waiting for its Bescheid must not name an amount')
    await page.goto(`${webOrigin}/app/verlauf/2026`, { waitUntil: 'networkidle' })
    await see('verlauf-fehlt-2026')
    if (!(await textOf('verlauf-fehlt-2026')).includes('die Lohnsteuerbescheinigungen 2026 (kommen ab Februar 2027)')) fail('an open year should say concretely what it lacks')
    await see('verlauf-zum-cockpit-2026')
    await page.goto(`${webOrigin}/app/verlauf/1999`, { waitUntil: 'networkidle' })
    await see('verlauf-jahr-unbekannt')
    console.log(`[${TAG}] ✅ Years — „wie erklärt“ with the change of filing type, two single returns, „nur Bescheid“, the waiting year without an amount, what an open year lacks`)

    // „Entwicklung ansehen“: the four key figures on their own page.
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await byId('verlauf-entwicklung').click()
    await atPath('/app/verlauf/entwicklung')
    await see('verlauf-entwicklung-titel')
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
    await byId('verlauf-datentabelle-umschalten').click()
    await see('verlauf-datentabelle')
    await byId('verlauf-detail-abgleich').click()
    await atPath('/app/verlauf/2024')
    await see('verlauf-abgleich-2024')
    await page.goto(`${webOrigin}/app/verlauf/entwicklung`, { waitUntil: 'networkidle' })
    await byId('verlauf-entwicklung-zurueck').click()
    await atPath('/app/verlauf')
    console.log(`[${TAG}] ✅ Development — /app/verlauf/entwicklung: refund first, person toggle, detail per year, data table, the Abgleich one tap away, back to the tab`)

    // The upload entry: the one Beleg pipeline with the kind `steuerbescheid`.
    let parseBody = null
    await page.route('**/v1/belege/parse', async (route) => {
      const body = route.request().postDataJSON()
      if (body.deviceReadFailure !== undefined) return route.continue()
      parseBody = body
      return route.fulfill(json(BESCHEID_READ))
    })
    await byId('verlauf-aeltere').click()
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
    await page.goto(`${webOrigin}/app/verlauf/2024`, { waitUntil: 'networkidle' })
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
    await page.goto(`${webOrigin}/app/verlauf/entwicklung`, { waitUntil: 'networkidle' })
    await see('verlauf-entwicklung-leer')
    await page.unroute('**/v1/verlauf')
    await page.route('**/v1/verlauf', (route) => route.fulfill(json({ ...HISTORY, openItems: [] })))
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await see('verlauf-jetzt-erledigt')
    if (await byId('verlauf-jetzt-ansehen').count()) fail('„Alles erledigt“ needs no button')
    await page.unroute('**/v1/verlauf')
    console.log(`[${TAG}] ✅ States — an error says so with a retry, an empty history says so and offers the upload, nothing due says „Alles erledigt“`)
    await ctx.close()

    // --- Desktop ------------------------------------------------------------------------------------
    const wide = await newContextAtBreakpoint(browser, 'l')
    const desk = await wide.newPage()
    guardAgainst429(desk, fail, '/api/auth/')
    await browserLogin(desk, webOrigin, user.email, TAG)
    await desk.route('**/v1/verlauf', (route) => route.fulfill(json(HISTORY)))
    await desk.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    const deskId = (id) => desk.locator(`[data-testid="${id}"]`)
    for (const id of ['verlauf-jetzt', 'verlauf-tabelle', 'verlauf-tabelle-2024', 'verlauf-entwicklung', 'verlauf-aeltere']) {
      await deskId(id).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(`${id} should be visible on the desktop`))
    }
    if (await deskId('verlauf-jahre').count()) fail('the desktop shows the table, not the phone list')
    const heads = await desk.locator('[data-testid="verlauf-tabelle"] [role="columnheader"]').allInnerTexts()
    if (heads.join('|') !== 'Jahr|Stand|erklärt|laut Bescheid') fail(`the table should have the four columns, it has ${heads.join('|')}`)
    if (await desk.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) fail('the Verlauf must not scroll sideways')
    await deskId('verlauf-tabelle-2023').click()
    await desk.waitForURL((u) => u.pathname === '/app/verlauf/2023', { timeout: 10_000 })
    await deskId('verlauf-abgleich-2023').waitFor({ state: 'visible', timeout: 10_000 })
    await desk.goto(`${webOrigin}/app/verlauf/2024`, { waitUntil: 'networkidle' })
    await deskId('verlauf-abgleich-2024').waitFor({ state: 'visible', timeout: 10_000 })
    const deskReceipt = await deskId('verlauf-abgleich-2024').boundingBox()
    if (deskReceipt === null || deskReceipt.width > 600) fail(`the receipt should not stretch across the desktop, it is ${deskReceipt?.width} px wide`)
    const deskRow = (await deskId('verlauf-abgleich-2024-zeile-homeofficeA').innerText()).replace(/\s+/g, ' ')
    if (!deskRow.includes('180 statt 210 Tage') || !deskRow.includes('2025 wieder 210 erklärt')) fail(`on a wide screen the short reason should stand whole under the label, the row says ${deskRow}`)
    await desk.goto(`${webOrigin}/app/verlauf/entwicklung`, { waitUntil: 'networkidle' })
    await deskId('verlauf-kpi-erstattung').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('the development should show the KPI tiles on the desktop'))
    await deskId('verlauf-kpi-werbungskosten').click()
    if (((await deskId('verlauf-karte-titel').innerText()) ?? '').trim() !== 'Werbungskosten je Jahr') fail('a KPI tile should pick its key figure')
    console.log(`[${TAG}] ✅ Desktop — hero, the timeline as a four-column table without sideways scroll, the year page, KPI tiles on the development page`)

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
    if (!(await deskId(`verlauf-tabelle-${YEAR}`).innerText()).includes('abgegeben · wartet auf Bescheid')) fail('the filed year should wait for its Bescheid in the Verlauf')
    await desk.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await deskId('cockpit-abgabe-zuruecknehmen').click()
    await deskId('cockpit-abgabe-marke-status').waitFor({ state: 'visible', timeout: 15_000 })
    await deskId('cockpit-abgabe-abgegeben').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('after the undo the cockpit should offer the button again'))
    console.log(`[${TAG}] ✅ Cockpit — „Ich habe die Erklärung abgegeben“ marks ${YEAR} as filed, „Abgabe zurücknehmen“ undoes it`)

    await wide.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — the Verlauf timeline, its year pages and Abgleich, the development, upload entry, lessons and the Abgabe verified (ADR-0098).`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
