// Row C of the main coverage run: the child mask's save states, the Günstigerprüfung figures, the paged
// Belege inbox and the stored receipts in the chat.
//
//   Row C1 — „Kind speichern“ says what is missing (no first name), points the Swiss allowance to the one
//            figure of the cross-border mask, and names the child it saved (commit cf0373ba).
//   Row C2 — the Günstigerprüfung shows its three figures once the household's other income is known
//            (LStB complete, German broker, capital income entered).
//   Row C3 — the Belege inbox comes in pages: „Mehr laden“ appends the next one (c8e19504 / 0b7644bb).
//   Row C4 — the stored receipts in the chat load further pages the same way.
//
// C3 and C4 serve the list endpoint by a route mock: a page holds 30 Belege, and uploading 31+ real
// documents is slow and runs into the per-IP upload/parse throttle. The mock starts from the real
// server's response (one real Beleg as the item template, the real CORS headers) and only multiplies
// the items and invents the cursor. Invented data only.

const PAGE_SIZE = 30 // RECEIPT_PAGE_SIZE of apps/mobile-web/src/lib/receipts/useReceiptInbox.ts
const SECOND_CURSOR = 'e2e-seite-2'
const SECOND_PAGE = 5
/** The first page's items that carry a file: the chat's picker shows only those (and at most 8). */
const FIRST_WITH_FILE = 3

export async function run(ctx) {
  const { page, api, webOrigin, YEAR, tid, visible, gone, fail, call, answer, until, TAG } = ctx

  // A single parent with a job, one child, and capital income at a German broker: the estimate (and so
  // the Günstigerprüfung) has everything it needs once the LStB is complete.
  await answer(api, YEAR, [
    ['job', 'Angestellt'],
    ['ausland', 'Nein'],
    ['kinder', '1 Kind'],
    ['familienstand', 'Ledig'],
    ['dhf', 'Nein'],
    ['umzug', 'Nein'],
    ['abfindung', 'Nein'],
    ['lohnersatz', 'Nein'],
    ['einkuenfte', 'Kapitalerträge'],
    ['kap-depot', 'Deutscher Broker'],
  ])

  // --- Row C1 — the child mask's save states ------------------------------------------------------
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/kinder`, { waitUntil: 'networkidle' })
  // Without a child yet the form opens at once; otherwise „Kind hinzufügen“ opens it.
  await page.locator(`${tid('kind-vorname')}, ${tid('kind-neu')}`).first().waitFor({ state: 'visible', timeout: 15_000 })
  if ((await page.locator(tid('kind-vorname')).count()) === 0) await page.locator(tid('kind-neu')).click()
  await visible(page, 'kind-vorname', 'Row C1')
  // The real validation: the first name is missing, so the press says so instead of doing nothing.
  await page.locator(tid('kind-vorname')).fill('')
  await page.locator(tid('kind-nachname')).fill('Beispiel')
  await page.locator(tid('kind-geburtsdatum')).pressSequentially('03072020')
  await page.locator(tid('kind-speichern')).click()
  await visible(page, 'kind-speichern-fehler', 'Row C1')
  const missing = await page.locator(tid('kind-speichern-fehler')).innerText()
  if (!missing.includes('Vorname')) fail(`Row C1: the error should name the missing first name, got "${missing}"`)
  if ((await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kinder`)).kinder?.length) fail('Row C1: nothing should be saved without a first name')

  await page.locator(tid('kind-vorname')).fill('Mira')
  await page.locator(tid('kind-verhaeltnis-1')).click()
  await page.locator(tid('kind-inland-ja')).click()
  await page.locator(tid('kind-weitere-angaben')).click()
  // The Swiss allowance is one figure with the cross-border mask: the field says so.
  await visible(page, 'kind-kinderzulage-hinweis', 'Row C1')
  const saved = page.waitForResponse((r) => r.url().includes(`/steuerjahre/${YEAR}/kinder`) && r.request().method() === 'POST', { timeout: 30_000 })
  await page.locator(tid('kind-speichern')).click()
  const savedRes = await saved
  if (!savedRes.ok()) fail(`Row C1: the child should be saved, got ${savedRes.status()}`)
  await visible(page, 'kind-gespeichert', 'Row C1')
  const savedText = await page.locator(tid('kind-gespeichert')).innerText()
  if (!savedText.includes('Mira')) fail(`Row C1: the confirmation should name the child, got "${savedText}"`)
  await gone(page, 'kind-speichern-fehler', 'Row C1')
  await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kinder`)).kinder?.[0]?.firstName ?? null, 'Mira', 'Row C1: the child should be stored')
  console.log(`[${TAG}] ✅ Row C — „Kind speichern“ names the missing first name, the allowance hint, and the saved child`)

  // --- Row C2 — the Günstigerprüfung figures ------------------------------------------------------
  for (const [field, value] of [['bruttoarbeitslohn', 60_000], ['lohnsteuer', 9_500], ['sozialversicherung', 12_000]]) {
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/${field}`, { kind: 'erfasst', value })
  }
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/kapital/kapitalertraege`, { kind: 'erfasst', value: 20_000 })
  const check = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kapital/guenstigerpruefung`)
  if (!check || check.kind === 'nicht-anwendbar') fail(`Row C2: the Günstigerprüfung should apply, got ${JSON.stringify(check).slice(0, 300)}`)
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/kapital`, { waitUntil: 'networkidle' })
  for (const id of ['guenstigerpruefung-abgeltung', 'guenstigerpruefung-persoenlich', 'guenstigerpruefung-unterschied']) await visible(page, id, 'Row C2')
  const euro = (n) => `${n.toLocaleString('de-DE')} €`
  for (const [id, value] of [['guenstigerpruefung-abgeltung', check.flatRateTax], ['guenstigerpruefung-persoenlich', check.personal], ['guenstigerpruefung-unterschied', Math.abs(check.delta)]]) {
    const shown = (await page.locator(tid(id)).innerText()).trim()
    if (shown !== euro(value ?? 0)) fail(`Row C2: "${id}" should show ${euro(value ?? 0)}, got "${shown}"`)
  }
  console.log(`[${TAG}] ✅ Row C — the Günstigerprüfung shows the flat tax, the personal tariff and the difference`)

  // --- Row C3 / C4 — the paged inbox --------------------------------------------------------------
  // One real Beleg: its response is the template the mock multiplies.
  await call(api, 'POST', '/v1/belege', { fileName: 'vorlage.pdf', kind: 'Sonstiges' })
  const name = (n) => `e2e-beleg-${String(n).padStart(2, '0')}.pdf`
  const secondPageIds = Array.from({ length: SECOND_PAGE }, (_, n) => `e2e-beleg-${PAGE_SIZE + n}`)
  const isList = (url) => new URL(url).pathname === '/v1/belege'
  let secondPageServed = 0
  const serveLongInbox = async (route) => {
    const request = route.request()
    if (request.method() !== 'GET') return route.continue()
    const url = new URL(request.url())
    const second = url.searchParams.get('cursor') === SECOND_CURSOR
    // The real server never saw the invented cursor: ask it for the first page and keep its headers.
    url.searchParams.delete('cursor')
    const real = await route.fetch({ url: url.toString() })
    const body = await real.json()
    const template = body.items[0]
    if (!template) fail('Row C3: the real inbox should hold the template Beleg')
    const item = (n) => ({ ...template, id: `e2e-beleg-${n}`, fileName: name(n), hasFile: n >= PAGE_SIZE || n < FIRST_WITH_FILE, duplicateOf: null })
    const items = second ? Array.from({ length: SECOND_PAGE }, (_, n) => item(PAGE_SIZE + n)) : Array.from({ length: PAGE_SIZE }, (_, n) => item(n))
    if (second) secondPageServed += 1
    const total = PAGE_SIZE + SECOND_PAGE
    const counts = { ...body.counts, total, folders: { ...body.counts.folders, weitere: total } }
    await route.fulfill({ response: real, json: { items, nextCursor: second ? null : SECOND_CURSOR, counts } })
  }

  await page.route(isList, serveLongInbox)
  try {
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await page.getByText(name(0), { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('Row C3: the first page should be shown'))
    if (await page.getByText(name(PAGE_SIZE), { exact: true }).count()) fail('Row C3: the second page should not be there before „Mehr laden“')
    await visible(page, 'belege-mehr-laden', 'Row C3')
    await page.locator(tid('belege-mehr-laden')).click()
    await page.getByText(name(PAGE_SIZE + SECOND_PAGE - 1), { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('Row C3: „Mehr laden“ should append the second page'))
    await page.locator(tid('belege-mehr-laden')).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail('Row C3: after the last page „Mehr laden“ should be gone'))
    if (secondPageServed === 0) fail('Row C3: the second page should be asked for with the cursor')
    console.log(`[${TAG}] ✅ Row C — the Belege inbox loads its next page with „Mehr laden“`)

    // The chat's picker reads the same pages and offers only the Belege with a file.
    secondPageServed = 0
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await visible(page, 'advisor-chat-input', 'Row C4', 20_000)
    const panel = page.locator(tid('advisor-receipt-panel'))
    for (let attempt = 0; attempt < 3 && !(await panel.isVisible()); attempt += 1) {
      await page.locator(tid('advisor-receipt-attach-btn')).click()
      await panel.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    }
    await visible(page, 'advisor-stored-receipts-toggle', 'Row C4')
    await page.locator(tid('advisor-stored-receipts-toggle')).click()
    await visible(page, 'advisor-stored-receipt-e2e-beleg-0', 'Row C4')
    if (await page.locator(tid(`advisor-stored-receipt-${secondPageIds[0]}`)).count()) fail('Row C4: the second page should not be offered before „mehr“')
    await visible(page, 'advisor-stored-receipts-more', 'Row C4')
    await page.locator(tid('advisor-stored-receipts-more')).click()
    await visible(page, `advisor-stored-receipt-${secondPageIds[0]}`, 'Row C4')
    await page.locator(tid('advisor-stored-receipts-more')).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail('Row C4: after the last page „mehr“ should be gone'))
    if (secondPageServed === 0) fail('Row C4: the second page should be asked for with the cursor')
    console.log(`[${TAG}] ✅ Row C — the chat's stored receipts load their next page`)
  } finally {
    await page.unroute(isList, serveLongInbox)
  }
}
