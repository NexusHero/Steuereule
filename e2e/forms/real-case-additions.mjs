// What the 2024/2025 real cases added to the masks (ADR-0076, ADR-0079–0086), in a real browser on the
// real stack, with invented data only:
//
//   Row A — commute: a change of job during the year (end of the first way, a second way with its own
//           km, transport, workplace and start) and the further Werbungskosten are saved.
//   Row A2 — the Strom then asks this cross-border commuter for the German LStB too (ADR-0089).
//   Row B — child: childcare amount, provider and period are saved with the child.
//   Row B2 — the child's printout hint names only what is really missing (Echtdatentest 18.11.2026).
//   Row P — Person B in the Strom: the basis asks about a German job of both, the partner page names B
//           (and refuses an empty name), B's masks name B, and the cockpit splits the income by person.
//   Row C — cross-border: the official annual average rate is offered and saved.
//   Row D — prepayments: the catalogue entry takes „Ja“ with the amount (and „Nein“ through the API).
//   Row E — printout check: a value too long for its box is named before payment.
//   Row E2 — chat: the composer counts near 8,000 characters and names a too-long message.
//   Row F — chat: a premium letter whose name fits neither partner asks „whose?“; Person A answers.
//   Row G — Person B's religion is stored only with consent (ADR-0090).
//   Row H0 — the LStB lines are summed by the app; Zeile 24 is asked for once 25/26 are filled (ADR-0093).
//   Row H — the LStB's Zeile 24 (employer subsidies) is saved (ADR-0090).
//   Rows I–N — whose a document is (ADR-0092):
//   Row I — a family statement in the chat: „Für wen?“, only that person's lines, „auch für Anna?“.
//   Row J — an amount already there: „zusätzlich oder ersetzen?“, never added silently (N2).
//   Row K — „für: Kemal“ in the Belege tab, given to Anna: the values move along.
//   Row L — a stranger's LStB in a single person's chat: Person B created from the document.
//   Row M — the place of the upload: B's mask, a name that contradicts it is asked about.
//   Row N — a user without a name: „Bist du …?“, the name goes into the profile (N1).
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf } from '../fixtures/synthetic-documents.mjs'
import * as D from '../fixtures/escalation-documents.mjs'

const TAG = 'real-case-additions'
const YEAR = 2025
const tid = (id) => `[data-testid="${id}"]`

async function visible(page, id, row, timeout = 15_000) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${row}: "${id}" should be visible`))
}

/**
 * Puts a file into the chat and waits until it is read. `/belege/parse` is throttled per IP (15 a minute),
 * and this file reads many documents from one machine: a 429 waits the window out and tries once more.
 */
async function chatUpload(page, row, name, buffer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await page.locator(tid('advisor-receipt-file-input')).count()) === 0) await page.locator(tid('advisor-receipt-attach-btn')).click()
    const parsed = page.waitForResponse((r) => r.url().includes('/belege/parse') && r.request().method() === 'POST', { timeout: 60_000 })
    await page.locator(tid('advisor-receipt-file-input')).setInputFiles({ name: attempt === 0 ? name : `nochmal-${name}`, mimeType: 'application/pdf', buffer })
    const res = await parsed
    if (res.status() !== 429) {
      if (!res.ok()) fail(`${row}: ${name} should be read, got ${res.status()}`)
      return res.json()
    }
    await page.waitForTimeout(61_000)
  }
  fail(`${row}: ${name} stayed throttled`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['de-job', 'Nur in der Schweiz'], ['kinder', '1 Kind'], ['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Ja, in die Schweiz'], ['partner-de-job', 'Nur in der Schweiz']])
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    // Row A — commute with a change of job, and the further Werbungskosten.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/arbeitstage`, { waitUntil: 'networkidle' })
    await visible(page, 'arbeitstage-km', 'Row A')
    await page.locator(tid('arbeitstage-km')).fill('12')
    await page.locator(tid('arbeitstage-transport-pkw')).click()
    await page.locator(tid('arbeitsweg-wechsel')).click()
    await page.locator(tid('arbeitsweg-bis')).fill('31.10.2025')
    await page.locator(tid('arbeitsweg-zweiter-ab')).fill('01.11.2025')
    await page.locator(tid('arbeitsweg-zweiter-km')).fill('80')
    await page.locator(tid('arbeitsweg-zweiter-transport-pkw')).click()
    await page.locator(tid('arbeitsweg-zweiter-ort')).fill('4058 Basel, Beispielstrasse 1')
    // Stated travel days (ADR-0093): more than the working days of the way's period is a contradiction;
    // a number that fits is kept, with the confirmation that the distance is the shortest road.
    await page.locator(tid('arbeitstage-fahrtage')).fill('400')
    await visible(page, 'arbeitstage-fahrtage-widerspruch', 'Row A')
    await page.locator(tid('arbeitstage-fahrtage')).fill('150')
    await page.locator(tid('arbeitstage-fahrtage-widerspruch')).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail('Row A: 150 travel days fit the first way and should not contradict'))
    await page.locator(tid('arbeitstage-kuerzeste')).click()
    await page.locator(tid('werbungskosten-arbeitsmittel')).fill('110')
    await page.locator(tid('werbungskosten-arbeitsmittel-art')).fill('Berufskleidung')
    await page.locator(tid('werbungskosten-kontofuehrung')).fill('16')
    await page.locator(tid('werbungskosten-verbaende')).fill('240')
    await page.locator(tid('werbungskosten-verbaende-art')).fill('Gewerkschaft')
    await page.locator(tid('werbungskosten-sonstiges')).fill('35')
    await page.locator(tid('werbungskosten-sonstiges-art')).fill('Bewerbungen')
    const savedCommute = page.waitForResponse((r) => r.url().includes('/arbeitsweg') && r.request().method() === 'PUT' && r.ok(), { timeout: 15_000 })
    await page.locator(tid('arbeitstage-weiter')).click()
    await savedCommute
    const commute = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/arbeitsweg`)).inputs
    const wanted = { travelDays: 150, shortestRouteConfirmed: true, oneWayKm: 12, periodTo: '31.10.2025', secondOneWayKm: 80, secondTransport: 'pkw', secondFrom: '01.11.2025', workEquipmentEur: 110, accountFeesEur: 16, professionalBodiesEur: 240, otherWorkExpensesEur: 35 }
    for (const [key, value] of Object.entries(wanted)) {
      if (commute?.[key] !== value) fail(`Row A: ${key} should be ${value}, got ${JSON.stringify(commute?.[key])}`)
    }
    console.log(`[${TAG}] ✅ Row A — a second way after a change of job and the further Werbungskosten are saved`)

    // Row A2 — the Strom (ADR-0089): after the way to work with a change of job, a cross-border
    // commuter is asked for the German wage tax certificate too (ADR-0079).
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/strom/arbeitsweg`, { waitUntil: 'networkidle' })
    await visible(page, 'strom-schritt-arbeitsweg', 'Row A2')
    await visible(page, 'arbeitstage-weiter', 'Row A2')
    await page.locator(tid('arbeitstage-weiter')).click()
    await visible(page, 'strom-schritt-lohnsteuerbescheinigung', 'Row A2')
    await visible(page, 'lstb-bruttoarbeitslohn', 'Row A2')
    console.log(`[${TAG}] ✅ Row A2 — the Strom asks a cross-border commuter who changed job for the German LStB`)

    // Row B — the child's childcare.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/kinder`, { waitUntil: 'networkidle' })
    // Without a child yet the form opens at once; otherwise „Kind hinzufügen“ opens it.
    await page.locator(`${tid('kind-vorname')}, ${tid('kind-neu')}`).first().waitFor({ state: 'visible', timeout: 15_000 })
    if ((await page.locator(tid('kind-vorname')).count()) === 0) await page.locator(tid('kind-neu')).click()
    await visible(page, 'kind-vorname', 'Row B')
    await page.locator(tid('kind-vorname')).fill('Lina')
    await page.locator(tid('kind-nachname')).fill('Beispiel')
    await page.locator(tid('kind-geburtsdatum')).pressSequentially('12052021')
    await page.locator(tid('kind-verhaeltnis-1')).click()
    await page.locator(tid('kind-inland-ja')).click()
    await page.locator(tid('kind-weitere-angaben')).click()
    await visible(page, 'kind-betreuung', 'Row B')
    await page.locator(tid('kind-betreuung')).fill('900')
    // A provider too long for the form's line is refused on entry and the field says so (ADR-0090).
    await page.locator(tid('kind-betreuung-anbieter')).fill('Kita, Gemeinde Musterdorf')
    await page.locator(tid('kind-betreuung-anbieter')).pressSequentially(', Kindertagesstätte Sonnenschein e. V., Hauptstraße 12')
    await visible(page, 'kind-betreuung-anbieter-voll', 'Row B')
    // Typed on, the field kept only what fits the line; the user shortens it to the short form.
    await page.locator(tid('kind-betreuung-anbieter')).fill('Kita, Gemeinde Musterdorf')
    // A Swiss basic insurance of the child goes into Anlage Kind Kz 89 (ADR-0090).
    await page.locator(tid('kind-kv-ausland')).click()
    await page.locator(tid('kind-betreuung-von')).fill('01.09.2025')
    await page.locator(tid('kind-betreuung-bis')).fill('31.12.2025')
    await page.locator(tid('kind-speichern')).click()
    await until(
      async () => {
        const child = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kinder`)).kinder?.[0]
        return child ? `${child.childcareEur}|${child.childcareProvider}|${child.childcareFrom}|${child.childcareTo}|${child.healthInsuranceAbroad}` : null
      },
      '900|Kita, Gemeinde Musterdorf|01.09.2025|31.12.2025|true',
      'Row B: the childcare amount, provider and period should be saved',
      15_000,
    )
    console.log(`[${TAG}] ✅ Row B — childcare amount, provider and period are saved with the child`)

    // Row B2 — the printout hint lists only the gaps of this child, never the whole list.
    const gap = page.locator('[data-testid^="kind-luecke-"]').first()
    await gap.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('Row B2: the child without a tax id should name the gap'))
    const gapText = await gap.innerText()
    if (!gapText.includes('Steuer-ID')) fail(`Row B2: the hint should name the missing Steuer-ID, got "${gapText}"`)
    console.log(`[${TAG}] ✅ Row B2 — the child's printout hint names what is missing`)

    // Row C — the official annual average rate (after the two Grenzgänger questions).
    await answer(api, YEAR, [['ch-wohnsitz', 'Deutschland'], ['ch-nichtrueckkehrtage', '0']])
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/schweiz`, { waitUntil: 'networkidle' })
    await visible(page, 'ch-wechselkurs-jahresdurchschnitt', 'Row C')
    await page.locator(tid('ch-wechselkurs-jahresdurchschnitt')).click()
    const savedRate = page.waitForResponse((r) => r.url().includes('/ch-lohnausweis/wechselkurs') && r.request().method() === 'PUT', { timeout: 15_000 })
    await page.locator(tid('ch-wechselkurs-speichern')).click()
    if (!(await savedRate).ok()) fail('Row C: saving the annual average rate should succeed')
    const ch = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ch-lohnausweis`)
    if (!JSON.stringify(ch).includes('"2025"')) fail(`Row C: the annual average (month "2025") should be stored, got ${JSON.stringify(ch).slice(0, 300)}`)
    console.log(`[${TAG}] ✅ Row C — the annual average rate is offered and saved`)

    // Row D — prepayments of the year.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/katalog/vorauszahlungen`, { waitUntil: 'networkidle' })
    await visible(page, 'katalog-option-vorauszahlungen-gate-Ja', 'Row D')
    await page.locator(tid('katalog-option-vorauszahlungen-gate-Ja')).click()
    await visible(page, 'katalog-input-vorauszahlungen-betrag', 'Row D')
    await page.locator(tid('katalog-input-vorauszahlungen-betrag')).fill('4800')
    await page.locator(tid('katalog-submit-vorauszahlungen-betrag')).click()
    await until(
      async () => {
        const state = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/interview?eintrag=vorauszahlungen`)
        return JSON.stringify(state).includes('4800')
      },
      true,
      'Row D: the prepayments should be stored',
      15_000,
    )
    // „Nein“ through the API, in another year: an answer the entry must take as well.
    await answer(api, 2024, [['vorauszahlungen-gate', 'Nein']])
    console.log(`[${TAG}] ✅ Row D — prepayments: „Ja“ with the amount in the mask, „Nein“ through the API`)

    // Row E — a value too long for its box is named before payment.
    await page.route('**/ausdruck/pruefung*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missing: ['zuLang.anlKind.z67Text'] }) }))
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/ausdruck`, { waitUntil: 'networkidle' })
    await visible(page, 'ausdruck-zu-lang', 'Row E')
    if (!(await page.locator(tid('ausdruck-zu-lang')).innerText()).includes('Kinderbetreuung')) fail('Row E: the too-long field should be named by its label')
    await page.unroute('**/ausdruck/pruefung*')
    console.log(`[${TAG}] ✅ Row E — a too-long entry is named before payment`)

    // Row E2 — a long chat message (ADR-0091 addendum): the composer counts near the limit of 8,000
    // characters and names a message beyond it instead of sending it.
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await visible(page, 'advisor-chat-input', 'Row E2')
    await page.locator(tid('advisor-chat-input')).fill('a'.repeat(7400))
    await visible(page, 'advisor-chat-length', 'Row E2')
    await page.locator(tid('advisor-chat-input')).fill('a'.repeat(8100))
    await visible(page, 'advisor-chat-too-long', 'Row E2')
    await page.locator(tid('advisor-chat-input')).fill('')
    console.log(`[${TAG}] ✅ Row E2 — the composer counts near the limit and names a message that is too long`)

    // Row F — a letter whose name fits neither partner: the chat asks whose it is.
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung/person-b`, { firstName: 'Anna', lastName: 'Beispiel' })
    await call(api, 'PUT', '/v1/profile', { firstName: 'Kemal', lastName: 'Beispiel' })
    const letter = await renderTextPdf(browser, [
      'Erika Fremd',
      `Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung ${YEAR}`,
      `Die Firma hat folgende Prämien im Jahr ${YEAR} für Sie geleistet:`,
      'Krankentaggeld:                      412,35 CHF',
      'Nichtberufsunfall:                   498,15 CHF',
    ])
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await visible(page, 'advisor-receipt-attach-btn', 'Row F')
    await page.locator(tid('advisor-receipt-attach-btn')).click()
    await page.locator(tid('advisor-receipt-file-input')).setInputFiles({ name: 'praemien.pdf', mimeType: 'application/pdf', buffer: letter })
    // Two people in the household: „Für wen?“ (ADR-0092); nothing is read for anyone before the answer.
    await visible(page, 'beleg-zuordnung-fuer-A', 'Row F', 60_000)
    await visible(page, 'beleg-zuordnung-fuer-B', 'Row F')
    const again = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/belege/parse') && (r.postData() ?? '').includes('"holder":"A"'), { timeout: 30_000 })
    await page.locator(tid('beleg-zuordnung-fuer-A')).click()
    await again
    console.log(`[${TAG}] ✅ Row F — the chat asks whose a letter is, and reads it again for Person A`)

    // Row G — Person B's religion, with consent (ADR-0090): without consent nothing is sent.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    await visible(page, 'stammdaten-familienstand-verheiratet', 'Row G')
    await page.locator(tid('stammdaten-familienstand-verheiratet')).click()
    await visible(page, 'personb-religion-RK', 'Row G')
    await page.locator(tid('personb-religion-RK')).click()
    await page.locator(tid('personb-speichern')).click()
    await visible(page, 'personb-einwilligung-fehlt', 'Row G')
    await page.locator(tid('personb-einwilligung')).click()
    await page.locator(tid('personb-speichern')).click()
    await until(
      async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kopplung`)).personB?.religion ?? null,
      'RK',
      "Row G: Person B's religion should be saved",
      15_000,
    )
    console.log(`[${TAG}] ✅ Row G — Person B's religion is saved after consent`)

    // Row H0 — the LStB lines 23, 25–27 and 5 (ADR-0093): the app adds them up, and Zeile 24 is asked for
    // as soon as 25 or 26 is filled.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    await visible(page, 'lstb-zeilen-rvArbeitnehmer', 'Row H0')
    for (const [line, value] of [['rvArbeitnehmer', '3000'], ['kvArbeitnehmer', '2500'], ['pvArbeitnehmer', '500'], ['avArbeitnehmer', '400']]) {
      await page.locator(tid(`lstb-zeilen-${line}`)).fill(value)
      await page.locator(tid(`lstb-zeilen-${line}`)).blur()
    }
    await page.locator(tid('lstb-zeilen-solidaritaetszuschlag')).fill('12,34')
    await page.locator(tid('lstb-zeilen-solidaritaetszuschlag')).blur()
    await until(
      async () => {
        const lines = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb-zeilen`)
        return `${lines.sozialversicherung}/${lines.solidaritaetszuschlag}`
      },
      '6400/12.34',
      'Row H0: the lines should be saved and summed by the app',
      15_000,
    )
    await visible(page, 'lstb-zeilen-summe', 'Row H0')
    await visible(page, 'lstb-zuschuesse-offen', 'Row H0')
    // The rows below read documents onto an empty certificate: take the lines out again.
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb-zeilen`, { rvArbeitnehmer: null, kvArbeitnehmer: null, pvArbeitnehmer: null, avArbeitnehmer: null, solidaritaetszuschlag: null })
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/sozialversicherung`, { kind: 'offen' })
    console.log(`[${TAG}] ✅ Row H0 — the LStB lines are summed by the app and Zeile 24 is asked for`)

    // Row H — LStB Zeile 24, the employer's tax-free subsidies (ADR-0090).
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    await visible(page, 'lstb-zuschuesse', 'Row H')
    await page.locator(tid('lstb-zuschuesse')).fill('5072')
    await page.locator(tid('lstb-zuschuesse')).blur()
    await until(
      async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb-zuschuesse`)).zuschuesseKvPv ?? null,
      5072,
      'Row H: the subsidies of Zeile 24 should be saved',
      15_000,
    )
    console.log(`[${TAG}] ✅ Row H — the employer subsidies of Zeile 24 are saved`)

    // Row I — a family statement in the chat (ADR-0092 §5): „Für wen?“, then only that person's lines,
    // and „auch für Anna übernehmen?“ links it to Anna with her own lines.
    await answer(api, YEAR, [['ch-wohnsitz', 'Deutschland']])
    const upload = async (row, name, lines) => {
      const pdf = await renderTextPdf(browser, lines.split('\n'))
      if ((await page.locator(tid('advisor-receipt-file-input')).count()) === 0) await page.locator(tid('advisor-receipt-attach-btn')).click()
      const stored = page.waitForResponse((r) => r.url().includes('/belege/upload') && r.request().method() === 'POST', { timeout: 60_000 })
      const parsed = page.waitForResponse((r) => r.url().includes('/belege/parse') && r.request().method() === 'POST', { timeout: 60_000 })
      await page.locator(tid('advisor-receipt-file-input')).setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
      const storedRes = await stored
      if (!storedRes.ok()) fail(`${row}: ${name} should be stored, got ${storedRes.status()}`)
      const res = await parsed
      if (!res.ok()) fail(`${row}: ${name} should be read, got ${res.status()}`)
      return { ...(await res.json()), storedId: (await storedRes.json()).id }
    }
    const choose = async (row, holder, extra = '') => {
      const parsed = page.waitForResponse((r) => r.url().includes('/belege/parse') && (r.request().postData() ?? '').includes(`"holder":"${holder}"`) && (r.request().postData() ?? '').includes(extra), { timeout: 60_000 })
      await page.locator(tid(`beleg-zuordnung-fuer-${holder}`)).click()
      return (await parsed).json()
    }
    const drafts = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/advisor/session`)).messages.flatMap((m) => [...(m.meta?.actions ?? []), ...(m.meta?.action ? [m.meta.action] : [])])
    const statement = D.familyHealth([
      { name: 'Kemal Beispiel', own: '0.00', premium: "2'100.00" },
      { name: 'Anna Beispiel', own: '0.00', premium: "1'950.00" },
      { name: 'Lina Beispiel', own: '0.00', premium: '480.00' },
    ])
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await visible(page, 'advisor-receipt-attach-btn', 'Row I')
    const asked = await upload('Row I', 'krankenkasse.pdf', statement)
    if (asked.assignment?.question?.reason !== 'which' || asked.stagedAction !== null) fail(`Row I: the statement should ask „Für wen?“ first, got ${JSON.stringify(asked.assignment)}`)
    await visible(page, 'beleg-zuordnung', 'Row I')
    await visible(page, 'beleg-zuordnung-frage', 'Row I')
    const forA = await choose('Row I', 'A')
    if (!(forA.assignment?.alsoFor ?? []).some((p) => p.holder === 'B')) fail(`Row I: Anna should be offered, got ${JSON.stringify(forA.assignment)}`)
    await visible(page, 'beleg-fuer', 'Row I')
    await visible(page, 'beleg-auch-fuer', 'Row I')
    const premiums = async () => (await drafts()).filter((d) => d.status === 'pending' && d.field === 'krankenkasseChf').map((d) => `${d.person ?? 'A'}:${d.newValue}`).sort()
    if (JSON.stringify(await premiums()) !== JSON.stringify(['A:2100'])) fail(`Row I: only Kemal's premium should be drafted, got ${JSON.stringify(await premiums())}`)
    const alsoB = page.waitForResponse((r) => r.url().includes('/belege/parse') && (r.request().postData() ?? '').includes('"alsoFor":true'), { timeout: 60_000 })
    await page.locator(tid('beleg-auch-fuer-B')).click()
    await alsoB
    await until(async () => JSON.stringify(await premiums()), JSON.stringify(['A:2100', 'B:1950']), 'Row I: Anna’s premium should be drafted for her too', 30_000)
    console.log(`[${TAG}] ✅ Row I — a family statement asks „Für wen?“, takes Kemal's lines, and „auch für Anna“ adds hers`)

    // Row J — the premium is in the return now; a statement with another amount asks „zusätzlich oder ersetzen?“ (N2).
    for (const d of (await drafts()).filter((x) => x.status === 'pending' && x.field === 'krankenkasseChf')) {
      await call(api, 'POST', `/v1/steuerjahre/${YEAR}/advisor/actions/${d.actionId}/apply`, {})
    }
    await upload('Row J', 'krankenkasse-korrektur.pdf', D.familyHealth([{ name: 'Kemal Beispiel', own: '0.00', premium: "2'300.00" }]))
    await choose('Row J', 'A')
    const pair = (await drafts()).filter((d) => d.status === 'pending' && d.field === 'krankenkasseChf' && (d.person ?? 'A') === 'A')
    if (JSON.stringify(pair.map((d) => `${d.combination}:${d.newValue}`)) !== JSON.stringify(['add:4400', 'replace:2300'])) fail(`Row J: both ways should wait, got ${JSON.stringify(pair.map((d) => [d.combination, d.newValue]))}`)
    await visible(page, 'eule-kombination-hinweis', 'Row J')
    const replace = pair.find((d) => d.combination === 'replace')
    await page.locator(tid(`draft-choose-${replace.actionId}`)).click()
    await until(
      async () => {
        const swiss = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ch-lohnausweis`)
        return swiss.nGre?.krankenkasseChf ?? swiss.items?.find((i) => i.kind === 'Krankenkasse')?.amountChf ?? null
      },
      2300,
      'Row J: „ersetzen“ should leave 2.300 CHF, not 4.400',
      30_000,
    )
    console.log(`[${TAG}] ✅ Row J — an amount already there: „zusätzlich oder ersetzen?“, the correction replaces it`)

    // Row K — „für: Kemal“ in the Belege tab: given to Anna, the LStB's values move along (ADR-0092 §4).
    const lstbAnna = D.lstb({ name: 'Anna Beispiel', employer: 'Beispiel GmbH', gross: 21000, wageTax: 2150, rv: 1953, kv: 1722, pv: 315, av: 273 })
    const { storedId: receiptId } = await upload('Row K', 'lstb-anna.pdf', lstbAnna)
    const wrong = await choose('Row K', 'A')
    if (wrong.lstb?.receiptId !== receiptId) fail(`Row K: the LStB should be read for Kemal from its Beleg, got ${JSON.stringify(wrong).slice(0, 300)}`)
    // A value Kemal already holds comes as „zusätzlich“ and „ersetzen“ (N2, Echtdatenlauf 4); taking one answers the
    // other. So the pending drafts are read again before each step, and of a pair „ersetzen“ is taken.
    let appliedDrafts = 0
    for (let step = 0; step < 30; step++) {
      const pending = (await drafts()).filter((x) => x.status === 'pending' && x.screen === 'lstb' && x.receiptId === receiptId)
      const next = pending.find((x) => x.combination == null || x.combination === 'replace')
      if (next === undefined) break
      await call(api, 'POST', `/v1/steuerjahre/${YEAR}/advisor/actions/${next.actionId}/apply`, {})
      appliedDrafts += 1
    }
    if ((await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).state?.bruttoarbeitslohn !== 21000) fail('Row K: the LStB should first be at Kemal')
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await visible(page, `beleg-inhaber-${receiptId}`, 'Row K')
    if (!(await page.locator(tid(`beleg-inhaber-${receiptId}`)).innerText()).includes('Kemal')) fail('Row K: the document should say „für: Kemal“')
    await page.locator(tid(`beleg-inhaber-${receiptId}`)).click()
    const moved = page.waitForResponse((r) => r.url().includes(`/belege/${receiptId}/inhaber`) && r.request().method() === 'POST', { timeout: 60_000 })
    await page.locator(tid(`beleg-inhaber-wahl-${receiptId}-B`)).click()
    const movedBody = await (await moved).json()
    await visible(page, `beleg-inhaber-ergebnis-${receiptId}`, 'Row K')
    // Every value taken back at Kemal is written for Anna, none waits; a draft writes one value or more (its card
    // lists them all since Echtdatenlauf 4), so at least as many values move as drafts were taken.
    if (movedBody.takenBack !== movedBody.applied || movedBody.waiting !== 0 || movedBody.applied < Math.max(1, appliedDrafts)) {
      fail(`Row K: every value taken over (${appliedDrafts} drafts) should move to Anna, got ${JSON.stringify({ ...movedBody, parse: undefined })}`)
    }
    const afterA = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).state?.bruttoarbeitslohn ?? null
    const afterB = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb?person=B`)).state?.bruttoarbeitslohn ?? null
    if (afterB !== 21000 || afterA === 21000) fail(`Row K: the gross wage should be Anna's now, got A ${afterA} B ${afterB}`)
    console.log(`[${TAG}] ✅ Row K — „für: Kemal“ given to Anna in the Belege tab: taken back at Kemal, written for Anna`)

    await ctx.close()
    await api.dispose()

    // Row L — a single person's chat: a stranger's LStB offers „als Person B anlegen?“ with the document's details.
    {
      const solo = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-solo` })
      await call(solo.api, 'PUT', '/v1/profile', { firstName: 'Kemal', lastName: 'Solo' })
      await answer(solo.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Nein']])
      await call(solo.api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'einzel' })
      const c2 = await newContextAtBreakpoint(browser, 'l')
      const p2 = await c2.newPage()
      guardAgainst429(p2, fail, '/api/auth/')
      await browserLogin(p2, webOrigin, solo.email, TAG)
      await p2.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
      await visible(p2, 'advisor-receipt-attach-btn', 'Row L')
      const jonas = ['Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025', 'Identifikationsnummer: 31 000 015 838', 'Jonas Weber', 'Geburtsdatum 03.04.1988', ...D.lstb({ name: '', employer: 'Weber AG', gross: 30000, wageTax: 4000, rv: 2790, kv: 2460, pv: 450, av: 390 }).split('\n').slice(3)]
      const pdf = await renderTextPdf(browser, jonas)
      await chatUpload(p2, 'Row L', 'lstb-jonas.pdf', pdf)
      await visible(p2, 'beleg-zuordnung-anlegen-b', 'Row L', 60_000)
      await p2.locator(tid('beleg-zuordnung-anlegen-b')).click()
      await visible(p2, 'beleg-zuordnung-anlegen-form', 'Row L')
      for (const [id, want] of [['beleg-zuordnung-anlegen-vorname', 'Jonas'], ['beleg-zuordnung-anlegen-nachname', 'Weber'], ['beleg-zuordnung-anlegen-geburtsdatum', '03.04.1988'], ['beleg-zuordnung-anlegen-steuerid', '31000015838']]) {
        const got = await p2.locator(tid(id)).inputValue()
        if (got !== want) fail(`Row L: ${id} should be taken from the document as ${want}, got ${got}`)
      }
      const forB = p2.waitForResponse((r) => r.url().includes('/belege/parse') && (r.request().postData() ?? '').includes('"holder":"B"'), { timeout: 60_000 })
      await p2.locator(tid('beleg-zuordnung-anlegen-speichern')).click()
      await forB
      const link = await call(solo.api, 'GET', `/v1/steuerjahre/${YEAR}/kopplung`)
      if (link.filingType !== 'zusammen' || link.personB?.firstName !== 'Jonas' || link.personB?.lastName !== 'Weber') fail(`Row L: Person B should be Jonas Weber, got ${JSON.stringify(link.personB)}`)
      const soloDrafts = (await call(solo.api, 'GET', `/v1/steuerjahre/${YEAR}/advisor/session`)).messages.flatMap((m) => m.meta?.actions ?? [])
      if (!soloDrafts.some((d) => d.screen === 'lstb' && d.person === 'B' && d.newValue === '30000')) fail('Row L: the LStB should be read for Jonas')
      console.log(`[${TAG}] ✅ Row L — a stranger's LStB creates Person B from the document and is read for B`)

      // Row M — the place of the upload: B's mask. A name that contradicts it is asked about; B's own is B's.
      await p2.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await visible(p2, 'partner-lstb', 'Row M', 30_000)
      await p2.locator(tid('partner-lstb')).click()
      await visible(p2, 'lstb-scan-cta', 'Row M')
      const kemal = await renderTextPdf(browser, D.lstb({ name: 'Kemal Solo', employer: 'Solo AG', gross: 40000, wageTax: 6000, rv: 3720, kv: 3280, pv: 600, av: 520 }).split('\n'))
      await p2.locator(tid('lstb-scan-file-input')).setInputFiles({ name: 'lstb-kemal.pdf', mimeType: 'application/pdf', buffer: kemal })
      await visible(p2, 'lstb-scan-zuordnung', 'Row M', 60_000)
      if (!(await p2.locator(tid('beleg-zuordnung-frage')).innerText()).includes('du bist bei Jonas')) fail('Row M: the question should name the mask’s person')
      await p2.locator(tid('beleg-zuordnung-fuer-A')).click()
      await visible(p2, 'lstb-scan-anderswo', 'Row M', 60_000)
      const ownB = await renderTextPdf(browser, D.lstb({ name: 'Jonas Weber', employer: 'Weber AG', gross: 30000, wageTax: 4000, rv: 2790, kv: 2460, pv: 450, av: 390 }).split('\n'))
      const areaParse = p2.waitForRequest((r) => r.url().includes('/belege/parse') && (r.postData() ?? '').includes('"area":"B"'), { timeout: 60_000 })
      await p2.locator(tid('lstb-scan-file-input')).setInputFiles({ name: 'lstb-jonas-2.pdf', mimeType: 'application/pdf', buffer: ownB })
      await areaParse
      await visible(p2, 'lstb-scan-apply', 'Row M', 60_000)
      if (await p2.locator(tid('lstb-scan-zuordnung')).count()) fail('Row M: B’s own LStB in B’s mask should not be asked about')
      console.log(`[${TAG}] ✅ Row M — B's mask: a contradicting name is asked about, B's own LStB is B's`)
      await c2.close()
      await solo.api.dispose()
    }

    // Row P — Person B in the Strom (Echtdatentest 18.11.2026).
    {
      const couple = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-paar` })
      await answer(couple.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['de-job', 'Auch in Deutschland'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Ja, in die Schweiz'], ['partner-de-job', 'Auch in Deutschland']])
      const c4 = await newContextAtBreakpoint(browser, 'l')
      const p4 = await c4.newPage()
      guardAgainst429(p4, fail, '/api/auth/')
      await browserLogin(p4, webOrigin, couple.email, TAG)
      await p4.goto(`${webOrigin}/app/steuerjahr/${YEAR}/strom/partner`, { waitUntil: 'networkidle' })
      await visible(p4, 'strom-partner-vorname', 'Row P')
      await p4.locator(tid('strom-weiter')).click()
      await visible(p4, 'strom-partner-fehler', 'Row P (empty name)')
      await p4.locator(tid('strom-partner-vorname')).fill('Nora')
      await p4.locator(tid('strom-partner-nachname')).fill('Beispiel')
      await p4.locator(tid('strom-partner-geburtsdatum')).fill('17.10.1991')
      await p4.locator(tid('strom-weiter')).click()
      // The own masks come first, then B's.
      await visible(p4, 'strom-schritt-schweiz', 'Row P (after the partner page)')
      const personB = (await call(couple.api, 'GET', `/v1/steuerjahre/${YEAR}/kopplung`)).personB
      if (personB?.firstName !== 'Nora' || personB?.geburtsdatum !== '1991-10-17') fail(`Row P: Person B should be saved, got ${JSON.stringify(personB)}`)
      await p4.goto(`${webOrigin}/app/steuerjahr/${YEAR}/strom/partner-schweiz`, { waitUntil: 'networkidle' })
      await visible(p4, 'ch-interview-titel', 'Row P (B’s certificate)')
      if ((await p4.locator(tid('ch-interview-titel')).innerText()) !== 'Wo wohnt Nora?') fail('Row P: B’s Swiss mask should ask „Wo wohnt Nora?“')
      // A German job of B puts B's LStB into the Strom too.
      await p4.goto(`${webOrigin}/app/steuerjahr/${YEAR}/strom/partner-lohnsteuerbescheinigung`, { waitUntil: 'networkidle' })
      await visible(p4, 'strom-schritt-partner-lohnsteuerbescheinigung', 'Row P (B’s LStB)')
      await visible(p4, 'lstb-bruttoarbeitslohn', 'Row P (B’s LStB)')
      // The cockpit's recorded income counts both persons and names each share.
      await call(couple.api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 30000 })
      await call(couple.api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/bruttoarbeitslohn?person=B`, { kind: 'erfasst', value: 20000 })
      await p4.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await p4.locator(tid(`jahr-${YEAR}`)).click()
      await visible(p4, 'cockpit-einkommen-personen', 'Row P (cockpit)')
      const split = await p4.locator(tid('cockpit-einkommen-personen')).innerText()
      if (!split.includes('Nora') || !split.includes('30.000') || !split.includes('20.000')) fail(`Row P: the cockpit should split the income, got "${split}"`)
      console.log(`[${TAG}] ✅ Row P — the Strom names Person B, asks B's masks and the cockpit splits the income`)
      await c4.close()
      await couple.api.dispose()
    }

    // Row N — a user without a name (N1): „Bist du …?“; „Nein“ offers to create the person, „Ja“ takes the name.
    {
      const anon = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-anon` })
      await answer(anon.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein']])
      const c3 = await newContextAtBreakpoint(browser, 'l')
      const p3 = await c3.newPage()
      guardAgainst429(p3, fail, '/api/auth/')
      await browserLogin(p3, webOrigin, anon.email, TAG)
      await p3.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
      await visible(p3, 'advisor-receipt-attach-btn', 'Row N')
      const mara = await renderTextPdf(browser, D.lstb({ name: 'Mara Neu', employer: 'Neu GmbH', gross: 25000, wageTax: 3000, rv: 2325, kv: 2050, pv: 375, av: 325 }).split('\n'))
      await chatUpload(p3, 'Row N', 'lstb-mara.pdf', mara)
      await visible(p3, 'beleg-zuordnung-bin-ich', 'Row N (first upload)', 60_000)
      if (!(await p3.locator(tid('beleg-zuordnung-frage')).innerText()).includes('Bist du Mara Neu?')) fail('Row N: the question should ask „Bist du Mara Neu?“')
      await p3.locator(tid('beleg-zuordnung-nicht-ich')).click()
      await visible(p3, 'beleg-zuordnung-anlegen-b', 'Row N')
      await p3.locator(tid('beleg-zuordnung-anlegen-b')).click()
      await p3.locator(tid('beleg-zuordnung-anlegen-abbrechen')).click()
      await chatUpload(p3, 'Row N', 'lstb-mara-2.pdf', mara)
      await visible(p3, 'beleg-zuordnung-bin-ich', 'Row N (second upload)', 60_000)
      await visible(p3, 'beleg-zuordnung-name-uebernehmen', 'Row N')
      const readForA = p3.waitForResponse((r) => r.url().includes('/belege/parse') && (r.request().postData() ?? '').includes('"holder":"A"'), { timeout: 60_000 })
      await p3.locator(tid('beleg-zuordnung-bin-ich')).click()
      await readForA
      const profile = await call(anon.api, 'GET', '/v1/profile')
      if (profile.firstName !== 'Mara' || profile.lastName !== 'Neu') fail(`Row N: the name should go into the profile, got ${JSON.stringify({ firstName: profile.firstName, lastName: profile.lastName })}`)
      console.log(`[${TAG}] ✅ Row N — a user without a name is asked „Bist du Mara Neu?“ and the name goes into the profile`)
      await c3.close()
      await anon.api.dispose()
    }
    console.log(`[${TAG}] PASS — the real-case additions work in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
