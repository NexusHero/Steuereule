// UX review 2026-11 — the cockpit says where the user stands, and the Belege inbox and the owl share one
// channel, both ways:
//  * Cockpit: progress line, the groups „Pflicht“ and „Erledigt“, the open steps on the submission
//    tile, and the row that leads to the documents waiting in the Belege tab;
//  * Belege: every waiting proposal is assigned in one tap; a document is handed to the owl from its
//    card (drafts are staged, nothing is written — Zero-Write), and a document whose original is gone
//    says so;
//  * Eule: the chat links back to the Belege tab and offers the documents already stored there.
//  * ADR-0097: a Belege upload is read right away; a chat batch (wrong year, nothing deductible, a
//    duplicate, an unreadable file) ends with one line per file; every Beleg card says what became of
//    it, keeps „Für wen?“, names what it filled and asks on delete whether those values go too.
//    The reading of the batch is served here (route mocks) so the row tests the app, not the readers;
//    the unreadable file goes to the real server, which records it.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf, syntheticLstbLines, TINY_PNG } from '../fixtures/synthetic-documents.mjs'

const TAG = 'belege-owl-channel'
const YEAR = 2025

const processing = (p) => ({ state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true, ...p })

/** What the reading answers for each file of the chat batch and the „Für wen?“ upload (ADR-0097). */
const READS = {
  'spende-2024.pdf': { draftsTaxYear: 2024, filedInTaxYear: 2024, processing: processing({ state: 'vorschlaege', pending: 1, draftsTaxYear: 2024 }) },
  'waage-2025.pdf': { noValuesReason: 'nicht_absetzbar', processing: processing({ state: 'nichts_verwertbar', reason: 'nicht_absetzbar', open: false }) },
  'spende-2024-kopie.pdf': {
    duplicateOf: { id: 'e2e-erst', fileName: 'spende-2024.pdf', uploadedAt: '2026-11-18T09:00:00.000Z' },
    processing: processing({ state: 'nichts_verwertbar', reason: 'dublette', open: false }),
  },
}

function parseAnswer(extra) {
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: YEAR },
    stagedAction: null,
    assistantMessage: null,
    draftsTaxYear: null,
    filedInTaxYear: null,
    noValuesReason: null,
    duplicateOf: null,
    processing: null,
    ...extra,
  }
}

/** A Beleg card as `GET /v1/belege` serves it, for the states the tab must word. */
function mockReceipt(id, fileName, state, extra = {}) {
  return {
    id,
    fileName,
    kind: 'Sonstiges',
    belegdatum: null,
    zahlungsdatum: null,
    hasFile: true,
    mimeType: 'application/pdf',
    byteLength: 1,
    assignment: { kind: 'ungebunden' },
    holders: [],
    holderTaxYear: null,
    processing: processing(state),
    filledFields: [],
    duplicateOf: null,
    ...extra,
  }
}

const MOCK_RECEIPTS = [
  mockReceipt('e2e-wartet', 'spende-2025.pdf', { state: 'vorschlaege', pending: 1, draftsTaxYear: 2025 }),
  mockReceipt('e2e-offen', 'arbeitsmittel.pdf', { state: 'vorschlaege', pending: 2, draftsTaxYear: 2024 }),
  mockReceipt('e2e-angebot', 'handwerker-2025.pdf', { state: 'nichts_verwertbar', reason: 'keine_rechnung', open: false }),
  mockReceipt('e2e-doppelt', 'spende-kopie.pdf', { state: 'nichts_verwertbar', reason: 'dublette', open: false }, { duplicateOf: { id: 'e2e-erst', fileName: 'spende-2025.pdf', uploadedAt: '2026-11-18T09:00:00.000Z' } }),
  mockReceipt('e2e-gefuellt', 'spende-drk.pdf', { state: 'uebernommen', applied: 1, draftsTaxYear: 2025, open: false }, {
    filledFields: [{ actionId: 'e2e-a1', taxYear: 2025, screen: 'interview', field: 'spenden-betrag', instance: null, person: 'A', label: 'Spenden', value: '3135' }],
  }),
]

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    // One finished area, so the cockpit has something under „Erledigt“.
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { workdays: [1, 2, 3, 4, 5], vacationDays: 25, sickDays: 3, homeOfficeDays: 40, oneWayKm: 28, transport: 'pkw', workplace: 'Dresden' })
    // Two documents with a date in the year: each waits with a proposal.
    const receipts = async () => call(api, 'GET', '/v1/belege')
    const upload = async (name, belegdatum) => {
      const res = await api.post('/v1/belege/upload', { multipart: { file: { name, mimeType: 'image/png', buffer: TINY_PNG }, kind: 'Sonstiges', belegdatum } })
      if (res.status() !== 201) fail(`uploading ${name} answered ${res.status()}`)
      return (await res.json()).id
    }
    const first = await upload('quittung-eins.png', `${YEAR}-03-01`)
    const second = await upload('quittung-zwei.png', `${YEAR}-04-01`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    const byId = (id) => page.locator(`[data-testid="${id}"]`)
    const see = async (id, timeout = 15_000) => byId(id).waitFor({ state: 'visible', timeout }).catch(() => fail(`${id} should be visible`))

    // --- Cockpit: where the user stands ------------------------------------------------------------
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await see('cockpit-fortschritt')
    const progress = await byId('cockpit-fortschritt-text').innerText()
    // Bounded digits: the count is small, and an open-ended \d+ on both sides can backtrack.
    if (!/^\d{1,3} von \d{1,3} Schritt(?:en)? erledigt$/.test(progress.trim())) fail(`the progress line should count the steps, it says "${progress}"`)
    await see('cockpit-bereich-pflicht')
    if (!/^\d{1,3} offen$/.test((await byId('cockpit-bereich-pflicht-anzahl').innerText()).trim())) fail('the „Pflicht“ group should say how many areas are open')
    await see('cockpit-bereich-erledigt')
    if ((await byId('cockpit-bereich-erledigt-anzahl').innerText()).trim() !== '1') fail('exactly the way to work is done and belongs under „Erledigt“')
    if ((await byId('cockpit-kachel-arbeitsweg-status').innerText()).trim() !== 'Erledigt') fail('the done tile keeps its status')
    await see('cockpit-abgabe-offen')
    console.log(`[${TAG}] ✅ Cockpit — "${progress.trim()}", groups „Pflicht“ and „Erledigt“, open steps on the submission tile`)

    await see('cockpit-belege-eingang')
    if (!(await byId('cockpit-belege-eingang').innerText()).includes('2 Belege')) fail('the cockpit should say that two documents wait')
    await byId('cockpit-belege-eingang').click()
    await page.waitForURL((u) => u.pathname === '/app/belege', { timeout: 10_000 })
    console.log(`[${TAG}] ✅ Cockpit — the row for waiting documents opens the Belege tab`)

    // --- Belege: one tap for every proposal ---------------------------------------------------------
    await see('belege-sammel-zuordnung')
    await byId('belege-alle-zuordnen').click()
    await until(async () => (await receipts()).every((r) => r.assignment.kind === 'zugeordnet' && r.assignment.taxYear === YEAR), true, 'one tap must assign both proposals to the year')
    await byId('belege-sammel-zuordnung').waitFor({ state: 'detached', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Belege — both proposals are assigned in one tap`)

    // A document whose original is gone cannot be read: the card says so instead of failing silently.
    await call(api, 'DELETE', `/v1/belege/${second}`)
    await byId(`receipt-eule-${second}`).click()
    await see(`receipt-eule-fehler-${second}`, 30_000)
    console.log(`[${TAG}] ✅ Belege — a document without its original says that the owl cannot read it`)

    // The reading of the batch and of the „Für wen?“ upload is served here; every other read is the real one.
    await page.route('**/v1/belege/parse', async (route) => {
      const body = route.request().postDataJSON()
      if (body.deviceReadFailure !== undefined) return route.continue()
      if (body.fileName === 'fuer-wen.pdf') {
        // Read slowly, so the card shows that it is reading; then ask whose it is until the user answers.
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        const question = { reason: 'which', options: [{ holder: 'A', name: null }], preselected: 'A', printedName: null, area: null, offerCreate: [] }
        const reply = body.holder === undefined
          ? parseAnswer({ assignment: { holder: null, question, alsoFor: [] } })
          : parseAnswer({ assignment: { holder: { holder: 'A', name: null }, question: null, alsoFor: [] }, processing: processing({ state: 'nichts_verwertbar', reason: 'nichts_erkannt', open: false }) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
      }
      const read = READS[body.fileName]
      if (read === undefined) return route.continue()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(parseAnswer(read)) })
    })

    // --- Belege → Eule: an uploaded certificate is read right away, its drafts wait in the owl ------
    const lstb = async () => call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await byId('belege-file-input').setInputFiles({ name: 'lstb-kanal.pdf', mimeType: 'application/pdf', buffer: await renderTextPdf(browser, syntheticLstbLines({ year: YEAR })) })
    let certificate = null
    await until(async () => {
      certificate = (await receipts()).find((r) => r.fileName === 'lstb-kanal.pdf')?.id ?? null
      return certificate !== null
    }, true, 'the uploaded certificate must be stored', 30_000)
    // No „Mit der Eule lesen“ any more (ADR-0097 §4): the tab reads it and its card says what came of it.
    await until(async () => (await byId(`receipt-${certificate}-zu-vorschlaegen`).isVisible()) || (await byId(`receipt-${certificate}-zuordnung`).isVisible()), true, 'the certificate must be read after its upload', 90_000)
    if (await byId(`receipt-${certificate}-zuordnung`).isVisible()) await byId('beleg-zuordnung-bin-ich').click()
    await see(`receipt-${certificate}-zu-vorschlaegen`, 60_000)
    if (!/^\d{1,2} Werte? warte[nt] auf dich$/.test((await byId(`receipt-${certificate}-stand`).innerText()).trim())) fail('the certificate card should say that its values wait')
    if ((await receipts()).find((r) => r.id === certificate)?.processing.state !== 'vorschlaege') fail('the server should derive „vorschlaege“ for the read certificate')
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: a Belege upload stages drafts, it must not write the LStB')
    await byId(`receipt-${certificate}-zu-vorschlaegen`).click()
    await page.waitForURL((u) => u.pathname === '/app/eule', { timeout: 30_000 })
    await see('advisor-lstb-scan-card', 60_000)
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: the drafts wait, nothing is written')
    console.log(`[${TAG}] ✅ Belege → Eule — the uploaded certificate is read right away, its card leads to the drafts, nothing is written`)

    // --- Eule: a batch ends with one line per file, from the server's state (ADR-0097 §3) ----------
    const openPanel = async () => {
      const panel = byId('advisor-receipt-panel')
      for (let attempt = 0; attempt < 3 && !(await panel.isVisible()); attempt += 1) {
        await byId('advisor-receipt-attach-btn').click()
        await panel.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
      }
    }
    await see('advisor-chat-input', 20_000)
    await openPanel()
    // Pasted text stays, but it says that it creates no Beleg.
    await byId('advisor-receipt-text-toggle').click()
    await see('advisor-receipt-text-hint')
    const text = (name, lines) => renderTextPdf(browser, lines).then((buffer) => ({ name, mimeType: 'application/pdf', buffer }))
    await byId('advisor-receipt-file-input').setInputFiles([
      await text('spende-2024.pdf', ['Zuwendungsbestätigung', 'Spende 120,00 EUR', 'Datum 15.03.2024']),
      await text('waage-2025.pdf', ['Rechnung', 'Personenwaage 49,90 EUR', 'Datum 02.02.2025']),
      await text('spende-2024-kopie.pdf', ['Zuwendungsbestätigung', 'Spende 120,00 EUR', 'Datum 15.03.2024', 'Kopie']),
      { name: 'kaputt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 kaputt') },
    ])
    await see('advisor-receipt-results', 90_000)
    await see('advisor-receipt-result-3-stand', 90_000)
    const line = async (id) => (await byId(id).innerText()).trim()
    if ((await line('advisor-receipt-result-0-stand')) !== 'spende-2024.pdf: 1 Wert wartet auf dich') fail(`the donation of 2024 should wait, it says "${await line('advisor-receipt-result-0-stand')}"`)
    if ((await line('advisor-receipt-result-0-jahr')) !== 'Liegt im Steuerjahr 2024') fail('the donation of 2024 should say that it lies in 2024')
    await see('advisor-receipt-result-0-jahr-wechseln')
    if ((await line('advisor-receipt-result-1-stand')) !== 'waage-2025.pdf: Nichts für die Erklärung: nicht absetzbar') fail('the scale should say that it is not deductible')
    if (!(await line('advisor-receipt-result-2-dublette')).startsWith('Doppelt: schon am 18.11.2026 hochgeladen (spende-2024.pdf)')) fail('the copy should name the first upload')
    if (!(await line('advisor-receipt-result-3-stand')).startsWith('kaputt.pdf: Nicht lesbar')) fail('the damaged file should say that it is not readable')
    // The device could not read it: the real server recorded that, so the Beleg does not stay „neu“.
    await until(async () => (await receipts()).find((r) => r.fileName === 'kaputt.pdf')?.processing.state, 'nicht_lesbar', 'the damaged file must be recorded as not readable', 20_000)
    console.log(`[${TAG}] ✅ Eule — a batch ends with one line per file (other year, not deductible, duplicate, not readable)`)

    // --- Eule → Belege: the way back, and the stored documents in the chat ---------------------------
    await see('eule-receipt-result-belege')
    await byId('eule-receipt-result-belege').click()
    await page.waitForURL((u) => u.pathname === '/app/belege', { timeout: 10_000 })
    console.log(`[${TAG}] ✅ Eule → Belege — the chat links back to the document's original`)

    await page.getByRole('tab', { name: 'Eule' }).click()
    await see('advisor-chat-input', 20_000)
    await openPanel()
    await see('advisor-stored-receipts')
    await byId('advisor-stored-receipts-toggle').click()
    await see(`advisor-stored-receipt-${first}`)
    if ((await page.locator('[data-testid^="advisor-stored-receipt-"]').count()) < 2) fail('the chat should offer the stored documents')
    // Its original disappears while the list is open: picking it says so.
    await call(api, 'DELETE', `/v1/belege/${first}`)
    await byId(`advisor-stored-receipt-${first}`).click()
    await see('advisor-stored-receipt-failed', 30_000)
    await byId('advisor-stored-receipts-all').click()
    await page.waitForURL((u) => u.pathname === '/app/belege', { timeout: 10_000 })
    console.log(`[${TAG}] ✅ Eule — the chat offers the stored documents, says when one is gone, and leads to all of them`)

    // The lines of the batch stay in the chat; the donation of 2024 switches the app to its year.
    await page.getByRole('tab', { name: 'Eule' }).click()
    await see('advisor-receipt-result-0-jahr-wechseln', 20_000)
    await byId('advisor-receipt-result-0-jahr-wechseln').click()
    await until(async () => page.evaluate(() => sessionStorage.getItem('steuereule.taxYear')), '2024', 'the switch should open tax year 2024')
    await byId('advisor-receipt-results-close').click()
    await byId('advisor-receipt-results').waitFor({ state: 'detached', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Eule — the batch lines stay, „liegt im Steuerjahr 2024 → wechseln“ opens 2024`)

    // --- Belege: every card says what became of it (ADR-0097), served states ------------------------
    const deleted = new Set()
    const deletes = []
    await page.route('**/v1/belege', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const real = await (await route.fetch()).json()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...real, ...MOCK_RECEIPTS.filter((r) => !deleted.has(r.id))]) })
    })
    await page.route('**/v1/belege/e2e-*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      const url = new URL(route.request().url())
      const id = url.pathname.split('/').pop()
      deletes.push(`${id}?${url.searchParams.get('takeBackValues')}`)
      deleted.add(id)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true, takenBack: id === 'e2e-gefuellt' ? 1 : 0, withdrawn: 0 }) })
    })
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await see('receipt-e2e-wartet-stand', 20_000)
    if ((await line('receipt-e2e-wartet-stand')) !== '1 Wert wartet auf dich') fail('a Beleg with a waiting draft should say so')
    // The app is in 2024 now: the drafts of 2025 say where they lie.
    if ((await line('receipt-e2e-wartet-jahr')) !== 'Liegt im Steuerjahr 2025') fail('the drafts of 2025 should say that they lie in 2025')
    if ((await line('receipt-e2e-angebot-stand')) !== 'Nichts für die Erklärung: keine Rechnung') fail('the order confirmation should say that it is no invoice')
    await see('receipt-e2e-angebot-grund')
    if (!(await line('receipt-e2e-doppelt-dublette')).startsWith('Doppelt: schon am 18.11.2026 hochgeladen (spende-2025.pdf)')) fail('the copy should name its first upload')
    if (!(await line('receipt-e2e-gefuellt-gefuellt')).startsWith('hat gefüllt: Spenden 3.135')) fail('the Beleg should list the value it filled')
    console.log(`[${TAG}] ✅ Belege — each card words its state, its year, a duplicate and what it filled`)

    // Delete: the values it filled are named, „Ja, Werte entfernen“ first; or only the Beleg goes.
    await byId('receipt-delete-e2e-gefuellt').click()
    await see('receipt-delete-frage-e2e-gefuellt')
    if (!(await line('receipt-delete-frage-e2e-gefuellt')).includes('Werte auch entfernen?')) fail('the delete question should ask whether the values go too')
    await byId('receipt-delete-werte-e2e-gefuellt').click()
    await see('belege-delete-ergebnis')
    if (!(await line('belege-delete-ergebnis')).includes('1 Wert entfernt')) fail('the delete should say that the value was taken back')
    await byId('receipt-delete-e2e-offen').click()
    await byId('receipt-delete-nur-beleg-e2e-offen').click()
    await until(async () => (await line('belege-delete-ergebnis')).includes('Seine Werte bleiben'), true, 'deleting only the Beleg should say that its values stay')
    if (deletes.join(',') !== 'e2e-gefuellt?true,e2e-offen?false') fail(`the deletes should carry takeBackValues, saw ${deletes.join(',')}`)
    console.log(`[${TAG}] ✅ Belege — delete names the filled values and takes them back on „ja“, or leaves them`)

    // „Für wen?“ from the background read stays on the card until it is answered.
    await byId('belege-file-input').setInputFiles(await text('fuer-wen.pdf', ['Rechnung', 'Brille 240,00 EUR']))
    let whose = null
    await until(async () => {
      whose = (await receipts()).find((r) => r.fileName === 'fuer-wen.pdf')?.id ?? null
      return whose !== null
    }, true, 'the upload must be stored', 30_000)
    await see(`receipt-${whose}-liest`, 20_000)
    await see(`receipt-${whose}-zuordnung`, 30_000)
    await byId('beleg-zuordnung-fuer-A').click()
    await byId(`receipt-${whose}-zuordnung`).waitFor({ state: 'detached', timeout: 30_000 })
    console.log(`[${TAG}] ✅ Belege — the question whose a document is stays on its card and is answered there`)

    // The waiting drafts of 2025: the card switches the year and leads to them.
    await byId('receipt-e2e-wartet-jahr-wechseln').click()
    await until(async () => page.evaluate(() => sessionStorage.getItem('steuereule.taxYear')), '2025', 'the card should switch back to 2025')
    await byId('receipt-e2e-wartet-zu-vorschlaegen').click()
    await page.waitForURL((u) => u.pathname === '/app/eule', { timeout: 10_000 })
    await page.unroute('**/v1/belege')
    await page.unroute('**/v1/belege/e2e-*')
    await page.unroute('**/v1/belege/parse')
    console.log(`[${TAG}] ✅ Belege — „Liegt im Steuerjahr 2025“ switches the year, „Zu den Vorschlägen“ opens the owl`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — cockpit progress, the Belege ↔ Eule channel and what became of every Beleg (ADR-0097) verified with synthetic documents.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
