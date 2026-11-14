// What the 2024/2025 real cases added to the masks (ADR-0076, ADR-0079–0086), in a real browser on the
// real stack, with invented data only:
//
//   Row A — commute: a change of job during the year (end of the first way, a second way with its own
//           km, transport, workplace and start) and the further Werbungskosten are saved.
//   Row B — child: childcare amount, provider and period are saved with the child.
//   Row C — cross-border: the official annual average rate is offered and saved.
//   Row D — prepayments: the catalogue entry takes „Ja“ with the amount (and „Nein“ through the API).
//   Row E — printout check: a value too long for its box is named before payment.
//   Row F — chat: a premium letter whose name fits neither partner asks „whose?“; Person A answers.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf } from '../fixtures/synthetic-documents.mjs'

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

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['kinder', '1 Kind'], ['familienstand', 'Verheiratet']])
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
    const wanted = { oneWayKm: 12, periodTo: '31.10.2025', secondOneWayKm: 80, secondTransport: 'pkw', secondFrom: '01.11.2025', workEquipmentEur: 110, accountFeesEur: 16, professionalBodiesEur: 240, otherWorkExpensesEur: 35 }
    for (const [key, value] of Object.entries(wanted)) {
      if (commute?.[key] !== value) fail(`Row A: ${key} should be ${value}, got ${JSON.stringify(commute?.[key])}`)
    }
    console.log(`[${TAG}] ✅ Row A — a second way after a change of job and the further Werbungskosten are saved`)

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
    await page.locator(tid('kind-betreuung-anbieter')).fill('Kita, Gemeinde Musterdorf')
    await page.locator(tid('kind-betreuung-von')).fill('01.09.2025')
    await page.locator(tid('kind-betreuung-bis')).fill('31.12.2025')
    await page.locator(tid('kind-speichern')).click()
    await until(
      async () => {
        const child = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kinder`)).kinder?.[0]
        return child ? `${child.childcareEur}|${child.childcareProvider}|${child.childcareFrom}|${child.childcareTo}` : null
      },
      '900|Kita, Gemeinde Musterdorf|01.09.2025|31.12.2025',
      'Row B: the childcare amount, provider and period should be saved',
      15_000,
    )
    console.log(`[${TAG}] ✅ Row B — childcare amount, provider and period are saved with the child`)

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
    await visible(page, 'advisor-certificate-owner-a', 'Row F', 60_000)
    await visible(page, 'advisor-certificate-owner-b', 'Row F')
    const again = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/belege/parse') && (r.postData() ?? '').includes('"person"') === false, { timeout: 30_000 })
    await page.locator(tid('advisor-certificate-owner-a')).click()
    await again
    console.log(`[${TAG}] ✅ Row F — the chat asks whose a letter is, and reads it again for Person A`)

    await ctx.close()
    await api.dispose()
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
