// Row L — the scanned LStB lines and a draft card's companion values, in the real web app.
//  * L1: a draft card of the owl lists every value „Übernehmen“ writes (commit cf0373ba): the session read
//    is served with one assistant message whose draft carries a companion value, as the deterministic
//    donations turn of the owl builds it (`companionFields: { spenden: 'Ja' }`).
//  * L2: a real scan of a synthetic LStB stages its further lines (Zeilen 5, 22–27) field by field; one of
//    them is marked yellow in the parse answer so it carries its own „Wert bestätigen“, which is pressed,
//    and the confirmed line is stored with „Werte übernehmen“.
// Invented data only.
import { renderTextPdf, syntheticLstbLines } from '../../fixtures/synthetic-documents.mjs'

const ROW = 'Row L'

export async function run({ page, api, webOrigin, YEAR, tid, visible, fail, call, answer, until, TAG }) {
  await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])

  // --- L1: the companion values of a draft card ------------------------------------------------------
  // The chat reads the session with `?conversationId=`, hence the `*`. Only the message list is extended;
  // everything else of the answer is the real stack's.
  const now = new Date().toISOString()
  const draft = {
    actionId: 'e2e-companion-draft',
    status: 'pending',
    screen: 'interview',
    field: 'spenden-betrag',
    instance: null,
    companionFields: { spenden: 'Ja' },
    label: 'Spenden & Zuwendungen (Sonderausgaben)',
    previousValue: '0 €',
    expectedPreviousValue: null,
    newValue: '250',
    beforeRefundEur: 840,
    afterRefundEur: 925,
    deltaEur: 85,
    reason: 'Sonderausgabenabzug nach § 10b EStG.',
    sourceId: 'estg-10b',
    paragraph: '§ 10b EStG',
  }
  const sessionRoute = '**/advisor/session*'
  await page.route(sessionRoute, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    // The page may close while this read is in flight; a late answer is irrelevant then.
    const res = await route.fetch().catch(() => null)
    if (res === null) return
    const json = await res.json()
    json.messages = [
      ...(json.messages ?? []),
      { id: 'e2e-companion-user', role: 'user', content: 'Ich habe 250 € gespendet.', meta: null, createdAt: now },
      {
        id: 'e2e-companion-assistant',
        role: 'assistant',
        content: 'Ich habe dir den Eintrag über 250 € vorbereitet:',
        meta: { sources: ['estg-10b'], actions: [draft] },
        createdAt: now,
      },
    ]
    await route.fulfill({ response: res, json })
  })
  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Eule' }).click()
  await visible(page, 'advisor-chat-panel', ROW)
  await visible(page, 'advisor-action-companions', ROW)
  const companion = page.locator(tid('advisor-action-companion-spenden'))
  await companion.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`${ROW}: the companion value "spenden" should be listed on the card`))
  const companionText = await companion.innerText()
  if (!companionText.includes('Ja')) fail(`${ROW}: the companion "spenden" should read „Ja“, reads "${companionText}"`)
  const boxText = await page.locator(tid('advisor-action-companions')).innerText()
  if (!boxText.includes('Wird mit eingetragen')) fail(`${ROW}: the companions should be captioned „Wird mit eingetragen:“, read "${boxText}"`)
  await page.unroute(sessionRoute, { behavior: 'ignoreErrors' })
  console.log(`[${TAG}] ✅ Row L — a draft card lists the companion value it writes (spenden: Ja)`)

  // --- L2: the scanned LStB lines, confirmed one by one ---------------------------------------------
  // The real parse answer, with Zeile 23a marked yellow: the stub reader of the stack reads a clean
  // text layer, so every line would otherwise come back green and offer no confirm button.
  const parseRoute = '**/belege/parse'
  await page.route(parseRoute, async (route) => {
    const res = await route.fetch().catch(() => null)
    if (res === null) return
    const json = await res.json()
    if (json?.lstb) {
      const read = json.lstb.lines?.rvArbeitnehmer
      json.lstb.lines = {
        ...json.lstb.lines,
        rvArbeitnehmer: {
          value: read?.value ?? 5_051.76,
          sourceLines: read?.sourceLines ?? ['23a'],
          calculation: read?.calculation ?? [],
          status: 'pruefen',
          reason: 'unreadable',
        },
      }
    }
    await route.fulfill({ response: res, json })
  })

  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
  await visible(page, 'lstb-scan-card', ROW)
  const pdf = await renderTextPdf(page.context().browser(), syntheticLstbLines({ year: YEAR }))
  await page.locator(tid('lstb-scan-file-input')).setInputFiles({ name: 'lstb-zeilen-2025.pdf', mimeType: 'application/pdf', buffer: pdf })
  await visible(page, 'lstb-scan-draft-banner', ROW, 60_000)
  await page.unroute(parseRoute, { behavior: 'ignoreErrors' })

  await visible(page, 'lstb-scan-lines', ROW)
  const lineInputs = page.locator('[data-testid^="lstb-scan-line-"]')
  if ((await lineInputs.count()) < 2) fail(`${ROW}: the scan should stage the further lines of the certificate, staged ${await lineInputs.count()}`)
  const rvInput = page.locator(tid('lstb-scan-line-rvArbeitnehmer'))
  await rvInput.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`${ROW}: Zeile 23a should be staged`))
  const rvText = await rvInput.inputValue()
  if (rvText !== '5052') fail(`${ROW}: Zeile 23a should be staged as 5052 (whole euros), shows "${rvText}"`)
  console.log(`[${TAG}] ✅ Row L — the scan stages the further lines, Zeile 23a as 5052`)

  // The yellow line has its own confirm button; pressing it confirms that line and only that line.
  const rvConfirm = page.locator(tid('lstb-confirm-line-rvArbeitnehmer'))
  await rvConfirm.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`${ROW}: the yellow Zeile 23a should offer „Wert bestätigen“`))
  if ((await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb-zeilen`)).rvArbeitnehmer) fail(`${ROW}: Zero-Write — nothing may be stored before „Werte übernehmen“`)
  await rvConfirm.click()
  await rvConfirm.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail(`${ROW}: the confirm button of Zeile 23a should go once pressed`))
  await page.waitForFunction(
    () => document.querySelector('[data-testid="lstb-scan-lines"]')?.textContent?.includes('Bestätigt ✓'),
    null,
    { timeout: 10_000 },
  ).catch(() => fail(`${ROW}: the confirmed Zeile 23a should read „Bestätigt ✓“`))
  console.log(`[${TAG}] ✅ Row L — „Wert bestätigen“ confirms the yellow Zeile 23a`)

  // Whatever else still asks for a check (a field, the employer) is confirmed too, then taken over.
  const pending = page.locator('[data-testid^="lstb-confirm-field-"], [data-testid^="lstb-confirm-line-"]')
  for (let guard = 0; guard < 15 && (await pending.count()) > 0; guard++) {
    const before = await pending.count()
    await pending.first().click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid^="lstb-confirm-field-"], [data-testid^="lstb-confirm-line-"]').length < n,
      before,
      { timeout: 10_000 },
    )
  }
  await page.locator(tid('lstb-scan-apply')).click()
  await until(
    async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb-zeilen`)).rvArbeitnehmer ?? null,
    5_052,
    `${ROW}: the confirmed Zeile 23a should be stored with „Werte übernehmen“`,
    20_000,
  )
  console.log(`[${TAG}] ✅ Row L — „Werte übernehmen“ stores the confirmed Zeile 23a (5.052 €)`)
}
