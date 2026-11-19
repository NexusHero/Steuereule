// ADR-0098 — the tab „Verlauf“ as a timeline (alternative A), end to end in the real app: the tab bar
// `Cockpit · Eule · Belege · Verlauf · Profil`, the old year-list links landing in the Verlauf, „Jetzt
// wichtig“ in the cockpit's dark block, one row per year, a year's own page (`/app/verlauf/:jahr`) with
// the Bescheid-Abgleich as a receipt (deadline chip, lessons inside the rows), back to the tab, „Entwicklung ansehen“
// (`/app/verlauf/entwicklung`) with the four key figures, tiers, the person toggle and the data table,
// the upload entry behind „Ältere Jahre ergänzen“ into the one Beleg pipeline, the same Abgleich in
// „Bescheid prüfen“, the lesson at the next year's mask, and „Ich habe die Erklärung abgegeben“ in the
// cockpit. ADR-0099: the life events between the rows, „änderbar bis“, a year without data that asks
// „Schon abgegeben?“ once (inline, then in „Jetzt wichtig“) and starts into its cockpit, the checklist of
// the open year, the repeated cut and the couple comparison on the year page, the group tabs of
// „Entwicklung“, „Unterlagen“ (`/app/verlauf/unterlagen`), and the new fields in the masks (employer on
// the LStB, the rental's purchase date and repairs, the Einspruch's date and outcome).
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
const NO_GROUPS = { crossBorder: null, rental: null, capital: null, pension: null, lossCarryForward: { status: 'notRecorded' } }
const EMPTY = {
  today: HISTORY.today,
  years: [],
  list: [],
  openItems: [],
  diffs: [],
  maskLessons: null,
  events: [],
  recurring: null,
  prepayments: { years: [], backPaymentYears: 0, consecutiveBackPayments: 0, averageBackPayment: null, hint: null },
  repeatedCuts: [],
  couples: [],
  groups: NO_GROUPS,
  documents: [],
}

/** ADR-0099 §1: the same household without 2022 in the app; it asks „Schon abgegeben?“ once and has no amount. */
const GAP_DEADLINE = { kind: 'abgabe-moeglich-bis', endsOn: '2026-12-31', remainingDays: 43, running: true, endsOnIfMandatory: null }
const OPEN_FIGURE = { tier: 'offen', missing: ['erklaerung'], delta: { kind: 'none', reason: 'offen' } }
function withGap2022(filedElsewhere, { withAppeal = true } = {}) {
  const ask = filedElsewhere.ask
  return {
    ...HISTORY,
    years: HISTORY.years.map((y) => (y.year === 2022 ? { ...y, tier: 'offen', missing: ['erklaerung'], erstattung: { ...y.erstattung, amount: OPEN_FIGURE, declared: null, difference: null } } : y)),
    list: HISTORY.list.map((l) =>
      l.year === 2022
        ? { ...l, status: 'entwurf', kind: 'offen', declaredRefund: null, assessedRefund: null, difference: null, deviations: 0, noDiffReason: 'kein-bescheid', hasData: false, filedElsewhere, withoutAssessment: false, deadline: GAP_DEADLINE }
        : l,
    ),
    openItems: [
      ...HISTORY.openItems.filter((o) => withAppeal || o.kind !== 'einspruchsfrist'),
      ...(filedElsewhere.answer === 'weiss-nicht' ? [] : [{ kind: 'offen', year: 2022, highlighted: false, missing: ['erklaerung'], filingDeadline: '2026-12-31', askFiledElsewhere: ask }]),
    ],
    diffs: HISTORY.diffs.filter((d) => d.year !== 2022),
    couples: HISTORY.couples.filter((c) => c.year !== 2022),
    documents: HISTORY.documents.filter((d) => d.year !== 2022),
  }
}
const ASKING = { answer: null, answeredOn: null, askAgainFrom: null, ask: true }
const ANSWERED_NO = { answer: 'nein', answeredOn: HISTORY.today, askAgainFrom: null, ask: false }

/** ADR-0099 §3, §7: every group tab — back payments, a second rental flat, a pension — on top of the household's Schweiz and Kapital. */
const RENTAL_YEARS = [
  { year: 2023, result: -3100, missing: [], depreciation: 3150, bookValueEnd: 206850 },
  { year: 2024, result: -800, missing: [], depreciation: 4200, bookValueEnd: 202650 },
  { year: 2025, result: 1450, missing: [], depreciation: 4200, bookValueEnd: 198450 },
]
const ALL_GROUPS = {
  ...HISTORY,
  prepayments: {
    years: [2022, 2023, 2024].map((year, i) => ({ year, refund: -[2100, 2600, 2500][i], backPayment: [2100, 2600, 2500][i], prepayments: 1200, adjustPrepayments: true })),
    backPaymentYears: 3,
    consecutiveBackPayments: 3,
    averageBackPayment: 2400,
    hint: 'Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).',
  },
  groups: {
    ...HISTORY.groups,
    rental: {
      properties: [
        { propertyKey: 'objekt-1', label: 'Lindenstraße 4', acquiredOn: '2023-04-01', depreciation: { annual: 4200, ratePercent: 2 }, years: RENTAL_YEARS, bookValue: 198450, yearsLeft: 47, acquisitionRelated: { windowEnd: '2026-04-01', limitEur: 37500, withinWindowEur: 12300, exceeds: false, roomLeftEur: 25200, windowOpen: false, undatedCounted: 0 } },
        { propertyKey: 'objekt-2', label: null, acquiredOn: null, depreciation: null, years: RENTAL_YEARS, bookValue: null, yearsLeft: null, acquisitionRelated: null },
      ],
    },
    pension: { startYear: 2021, sharePercent: 81, allowance: 2944, allowanceYear: 2022, years: [{ year: 2024, amount: 18400, taxablePart: 15456 }, { year: 2025, amount: 19200, taxablePart: 16256 }] },
  },
}
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
    if (!(await textOf('verlauf-jahr-2023')).includes('änderbar bis 31.12.2027')) fail('an assessed year should say until when it can be changed')
    await see('verlauf-entwicklung')
    await see('verlauf-unterlagen')
    await see('verlauf-aeltere')
    // ADR-0099 §4: one marker per year with an event, between the rows.
    const markers = await page.locator('[data-testid^="verlauf-ereignis-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    if (markers.join() !== 'verlauf-ereignis-2025,verlauf-ereignis-2024,verlauf-ereignis-2023') fail(`the life events should mark 2025, 2024 and 2023, they are ${markers.join()}`)
    if ((await textOf('verlauf-ereignis-2024')) !== '2024 · neuer Arbeitgeber, Start als Grenzgänger') fail('the marker should name the events of its year')
    // ADR-0099: the tab stays one phone screen — the link row ends within about 760 px of the timeline's top.
    const top = await byId('verlauf-jetzt').boundingBox()
    const end = await byId('verlauf-unterlagen').boundingBox()
    if (top === null || end === null || end.y + end.height - top.y > 760) fail(`the hero and the timeline should fit one phone screen, they take ${end && top ? Math.round(end.y + end.height - top.y) : '?'} px`)
    console.log(`[${TAG}] ✅ Timeline — one row per year with one phrase and one amount, a range stays a range, „änderbar bis“, the life events between the rows, „Unterlagen“ beside the development`)

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

    // ADR-0099 §2, §5, §6: the checklist of the open year, the repeated cut and the couple comparison.
    await page.goto(`${webOrigin}/app/verlauf/2026`, { waitUntil: 'networkidle' })
    await see('verlauf-wiederkehrend-2026')
    if (!(await textOf('verlauf-wiederkehrend-2026-homeoffice')).includes('⚠ 2023 und 2024 gekürzt')) fail('the checklist should name the cuts that came again')
    if (!(await textOf('verlauf-wiederkehrend-2026-kontofuehrung')).includes('2025: 32 €')) fail('the checklist should name last year’s amount as a hint')
    await byId('verlauf-wiederkehrend-2026-belege').click()
    await atPath('/app/belege')
    await page.goto(`${webOrigin}/app/verlauf/2024`, { waitUntil: 'networkidle' })
    await see('verlauf-muster-2024')
    if (!(await textOf('verlauf-muster-2024-homeofficeA')).startsWith('Zum zweiten Mal gekürzt: Homeoffice-Pauschale 2023 und 2024, je 180 € weniger anerkannt.')) fail('the year page should name the repeated cut')
    if (!(await textOf('verlauf-paare-2024')).includes('Zusammen veranlagt: 2024 hat das etwa 1.010 € bis 1.230 € gebracht')) fail('the year page should say what joint filing brought')
    if (!(await textOf('verlauf-paare-2024-etwa')).startsWith('Rechnung der App')) fail('a joint Bescheid split by the app should say it is approximate')
    await see('verlauf-jahr-aenderbar')
    console.log(`[${TAG}] ✅ Hints — „Kommt jedes Jahr wieder“ on 2026 with the way to the Belege, „Zum zweiten Mal gekürzt“ and the couple comparison („etwa“) on 2024`)

    // ADR-0099 §9: „Unterlagen“ — the Bescheide one by one, the time to them, the Einsprüche.
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await byId('verlauf-unterlagen').click()
    await atPath('/app/verlauf/unterlagen')
    for (const id of ['verlauf-unterlagen-titel', 'verlauf-unterlagen-bescheide', 'verlauf-unterlagen-jahr-2024', 'verlauf-unterlagen-dauer', 'verlauf-unterlagen-dauer-2024', 'verlauf-unterlagen-nachfragen-2025', 'verlauf-unterlagen-einsprueche', 'verlauf-unterlagen-einspruch-2022-0']) await see(id)
    if (!(await textOf('verlauf-unterlagen-dauer-2024')).includes('6 Wochen')) fail('the Unterlagen should say how long the Bescheid took')
    if (!(await textOf('verlauf-unterlagen-einspruch-2022-0')).includes('teilweise stattgegeben')) fail('the appeal history should name the outcome')
    await page.route('**/v1/belege/bescheid-2024/datei', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }))
    await byId('verlauf-unterlagen-bescheid-bescheid-2024').click()
    await see('receipt-file-modal')
    await page.unroute('**/v1/belege/bescheid-2024/datei')
    await byId('verlauf-unterlagen-zurueck').click()
    await atPath('/app/verlauf')
    history = EMPTY
    await page.goto(`${webOrigin}/app/verlauf/unterlagen`, { waitUntil: 'networkidle' })
    await see('verlauf-unterlagen-leer')
    history = HISTORY
    console.log(`[${TAG}] ✅ Unterlagen — /app/verlauf/unterlagen: Bescheide per year with the preview, weeks to the Bescheid with „Nachfragen lohnt sich“, the Einsprüche, the empty state`)

    // ADR-0099 §3, §7: the group tabs on „Entwicklung“, only with data.
    await page.goto(`${webOrigin}/app/verlauf/entwicklung`, { waitUntil: 'networkidle' })
    if (await byId('verlauf-bereich-vorauszahlungen').count()) fail('a household without back payments has no prepayment tab')
    await byId('verlauf-bereich-schweiz').click()
    for (const id of ['verlauf-gruppe-schweiz', 'verlauf-gruppe-schweiz-kurs', 'verlauf-gruppe-schweiz-quellensteuer', 'verlauf-gruppe-schweiz-anteil', 'verlauf-gruppe-diagramm']) await see(id)
    await byId('verlauf-gruppe-tabelle-umschalten').click()
    await see('verlauf-gruppe-tabelle')
    await byId('verlauf-bereich-kapital').click()
    for (const id of ['verlauf-gruppe-kapital', 'verlauf-gruppe-kapital-pauschbetrag', 'verlauf-gruppe-kapital-guenstiger']) await see(id)
    history = ALL_GROUPS
    await page.goto(`${webOrigin}/app/verlauf/entwicklung`, { waitUntil: 'networkidle' })
    await byId('verlauf-bereich-vorauszahlungen').click()
    await see('verlauf-gruppe-vorauszahlungen')
    if (!(await textOf('verlauf-gruppe-vorauszahlungen-hinweis')).includes('Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).')) fail('back payments should lead to the prepayment hint')
    await byId('verlauf-bereich-vermietung').click()
    for (const id of ['verlauf-gruppe-vermietung', 'verlauf-gruppe-objekt-0', 'verlauf-gruppe-objekt-0-grenze', 'verlauf-gruppe-objekt-1', 'verlauf-gruppe-verlustvortrag']) await see(id)
    await byId('verlauf-gruppe-tabelle-1-umschalten').click()
    await see('verlauf-gruppe-tabelle-1')
    await byId('verlauf-bereich-rente').click()
    await see('verlauf-gruppe-rente')
    await see('verlauf-gruppe-rente-jahre')
    await page.goto(`${webOrigin}/app/verlauf/2024`, { waitUntil: 'networkidle' })
    await see('verlauf-vorauszahlung-2024')
    history = HISTORY
    console.log(`[${TAG}] ✅ Development — group tabs only with data: Schweiz and Kapital for the household, Vorauszahlungen, Vermietung and Rente when there is data, each with its table`)

    // ADR-0099 §1: a year without data asks „Schon abgegeben?“ once, inline while the Einspruch is more urgent.
    const answers = []
    await page.route('**/v1/steuerjahre/2022/abgabe-anderswo', async (route) => {
      const body = route.request().postDataJSON()
      answers.push(body.answer)
      history = body.answer === 'nein' ? withGap2022(ANSWERED_NO) : withGap2022({ answer: body.answer, answeredOn: HISTORY.today, askAgainFrom: '2026-10-01', ask: false })
      return route.fulfill(json({ year: 2022, status: body.answer === 'ja' ? 'extern-erledigt' : 'entwurf', filedElsewhere: { answer: body.answer, answeredOn: HISTORY.today, askAgainFrom: null, ask: false }, deadline: GAP_DEADLINE }))
    })
    history = withGap2022(ASKING)
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await see('verlauf-frage-2022')
    if ((await textOf('verlauf-jahr-2022')).includes('€')) fail('a year without data must not show an amount')
    await byId('verlauf-frage-2022-nein').click()
    await byId('verlauf-frage-2022').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail('after the answer the row should not ask again'))
    if (!(await textOf('verlauf-jahr-2022')).includes('noch nicht abgegeben · bis 31.12.2026 möglich')) fail('after „Nein“ the row should say until when 2022 can be filed')
    // Without the Einspruch the year is the most urgent: the question moves into „Jetzt wichtig“.
    history = withGap2022(ASKING, { withAppeal: false })
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await see('verlauf-jetzt-frage')
    if (await byId('verlauf-frage-2022').count()) fail('the question belongs in one place at a time')
    await byId('verlauf-jetzt-frage-weiss-nicht').click()
    await until(async () => answers.join(), 'nein,weiss-nicht', 'the answers should go to PUT /abgabe-anderswo')
    history = withGap2022(ANSWERED_NO, { withAppeal: false })
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    if (!(await textOf('verlauf-jetzt-inhalt')).includes('bis 31.12.2026 möglich')) fail('the open year should say until when it can be filed')
    history = withGap2022(ASKING)
    await page.goto(`${webOrigin}/app/verlauf/2022`, { waitUntil: 'networkidle' })
    await see('verlauf-jahr-frage-2022')
    history = withGap2022(ANSWERED_NO, { withAppeal: false })
    await page.goto(`${webOrigin}/app/verlauf`, { waitUntil: 'networkidle' })
    await byId('verlauf-jetzt-anfangen').click()
    await page.waitForURL((u) => u.pathname === '/app' || u.pathname === '/app/', { timeout: 10_000 }).catch(() => fail('„2022 anfangen“ should open the cockpit'))
    await page.unroute('**/v1/steuerjahre/2022/abgabe-anderswo')
    history = HISTORY
    console.log(`[${TAG}] ✅ Gap year — „Schon abgegeben?“ inline, then in „Jetzt wichtig“, no amount, „bis 31.12.2026 möglich“ after „Nein“, „2022 anfangen“ opens its cockpit`)

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

    // ADR-0099 §8: the Einspruch's date when lodging, then its outcome and amount (served here, the flow needs a Bescheid).
    let lodged = null
    const outcomes = []
    await page.route('**/v1/steuerjahre/2024/bescheid', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const real = await (await route.fetch()).json()
      const base = { ...real, assessmentDate: '2026-11-02', frist: { assessmentDate: '2026-11-02', deadlineEnd: '2026-12-07', remainingDays: 19, running: true } }
      if (lodged === null) return route.fulfill(json({ ...base, status: 'geprüft', nextStates: ['einspruch-eingelegt'] }))
      return route.fulfill(json({ ...base, status: 'einspruch-eingelegt', nextStates: [], appealReason: lodged.reason, appealDate: lodged.date ?? HISTORY.today, appealOutcome: outcomes.at(-1)?.outcome ?? 'offen', appealOutcomeAmount: outcomes.at(-1)?.amount ?? null }))
    })
    await page.route('**/v1/steuerjahre/2024/bescheid/einspruch', async (route) => {
      lodged = route.request().postDataJSON()
      return route.fulfill(json({}))
    })
    await page.route('**/v1/steuerjahre/2024/bescheid/einspruch/ergebnis', async (route) => {
      outcomes.push(route.request().postDataJSON())
      return route.fulfill(json({}))
    })
    await page.goto(`${webOrigin}/app/steuerjahr/2024/bescheid`, { waitUntil: 'networkidle' })
    await byId('bescheid-einspruch-datum').fill('12.11.2026')
    await byId('bescheid-einspruch-grund-betrag-falsch').click()
    await see('bescheid-einspruch-eingelegt-am')
    if (lodged?.date !== '2026-11-12' || lodged?.reason !== 'betrag-falsch') fail(`the Einspruch should be lodged with its date, it sent ${JSON.stringify(lodged)}`)
    await see('bescheid-einspruch-ergebnis')
    await byId('bescheid-einspruch-ergebnis-teilweise').click()
    await byId('bescheid-einspruch-betrag').fill('140')
    await byId('bescheid-einspruch-betrag').press('Tab')
    await until(async () => JSON.stringify(outcomes.at(-1)), JSON.stringify({ outcome: 'teilweise', amount: 140 }), 'the outcome and its amount should be saved')
    for (const glob of ['**/v1/steuerjahre/2024/bescheid', '**/v1/steuerjahre/2024/bescheid/einspruch', '**/v1/steuerjahre/2024/bescheid/einspruch/ergebnis']) await page.unroute(glob)
    console.log(`[${TAG}] ✅ Einspruch — lodged with its date, then „teilweise stattgegeben“ with +140 €`)

    // ADR-0099 §8: the employer on the LStB and the rental's purchase date and repairs (real server).
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    await byId('lstb-arbeitgeber').fill('Roche AG')
    await byId('lstb-arbeitgeber').press('Tab')
    await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb-arbeitgeber`)).arbeitgeber, 'Roche AG', 'the employer should be stored with the LStB')
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/vermietung`, { waitUntil: 'networkidle' })
    if (!(await byId('vermietung-0-anschaffungsdatum').count())) await byId('objekt-hinzufuegen').click()
    await see('vermietung-0-erhaltung')
    await byId('vermietung-0-anschaffungsdatum').fill('01.04.2024')
    await byId('vermietung-0-erhaltung-hinzufuegen').click()
    await byId('vermietung-0-erhaltung-0-betrag').fill('12300')
    await byId('vermietung-0-erhaltung-0-betrag').press('Tab')
    await byId('vermietung-0-erhaltung-0-datum').fill('15.05.2025')
    const rental = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/vermietung`)).properties[0]
    await until(async () => (await rental())?.anschaffungsdatum, '2024-04-01', 'the purchase date should be stored with the property')
    const repairs = async () => ((await rental())?.erhaltungsaufwand ?? []).map((r) => `${r.betrag}@${r.datum}`).join()
    await until(repairs, '12300@2025-05-15', 'the repair should be stored with its date')
    await byId('vermietung-0-erhaltung-0-entfernen').click()
    await until(repairs, '', 'a removed repair should leave the list')
    console.log(`[${TAG}] ✅ Masks — the employer on the LStB, the rental's purchase date and its repairs are stored`)

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
