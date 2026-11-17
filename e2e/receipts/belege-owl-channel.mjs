// UX review 2026-11 — the cockpit says where the user stands, and the Belege inbox and the owl share one
// channel, both ways:
//  * Cockpit: progress line, the groups „Pflicht“ and „Erledigt“, the open steps on the submission
//    tile, and the row that leads to the documents waiting in the Belege tab;
//  * Belege: every waiting proposal is assigned in one tap; a document is handed to the owl from its
//    card (drafts are staged, nothing is written — Zero-Write), and a document whose original is gone
//    says so;
//  * Eule: the chat links back to the Belege tab and offers the documents already stored there.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf, syntheticLstbLines, TINY_PNG } from '../fixtures/synthetic-documents.mjs'

const TAG = 'belege-owl-channel'
const YEAR = 2025

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
    if (!/^\d+ von \d+ Schritten? erledigt$/.test(progress.trim())) fail(`the progress line should count the steps, it says "${progress}"`)
    await see('cockpit-bereich-pflicht')
    if (!/\d+ offen/.test(await byId('cockpit-bereich-pflicht-anzahl').innerText())) fail('the „Pflicht“ group should say how many areas are open')
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

    // --- Belege → Eule: a stored certificate is handed to the owl -----------------------------------
    const lstb = async () => call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await byId('belege-file-input').setInputFiles({ name: 'lstb-kanal.pdf', mimeType: 'application/pdf', buffer: await renderTextPdf(browser, syntheticLstbLines({ year: YEAR })) })
    let certificate = null
    await until(async () => {
      certificate = (await receipts()).find((r) => r.fileName === 'lstb-kanal.pdf')?.id ?? null
      return certificate !== null
    }, true, 'the uploaded certificate must be stored', 30_000)
    await see(`receipt-eule-${certificate}`, 30_000)
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: a Belege upload must not write the LStB')
    await byId(`receipt-eule-${certificate}`).click()
    await page.waitForURL((u) => u.pathname === '/app/eule', { timeout: 90_000 })
    await see('advisor-lstb-scan-card', 60_000)
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: handing a document to the owl stages a draft, it writes nothing')
    console.log(`[${TAG}] ✅ Belege → Eule — the stored certificate is read, its draft waits in the chat, nothing is written`)

    // --- Eule → Belege: the way back, and the stored documents in the chat ---------------------------
    await see('eule-receipt-result-belege')
    await byId('eule-receipt-result-belege').click()
    await page.waitForURL((u) => u.pathname === '/app/belege', { timeout: 10_000 })
    console.log(`[${TAG}] ✅ Eule → Belege — the chat links back to the document's original`)

    await page.getByRole('tab', { name: 'Eule' }).click()
    await see('advisor-chat-input', 20_000)
    const panel = byId('advisor-receipt-panel')
    for (let attempt = 0; attempt < 3 && !(await panel.isVisible()); attempt += 1) {
      await byId('advisor-receipt-attach-btn').click()
      await panel.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    }
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

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — cockpit progress and the Belege ↔ Eule channel verified with synthetic documents.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
