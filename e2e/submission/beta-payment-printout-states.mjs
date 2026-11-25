// Beta readiness (PR #581) — the payment return trip of the printout, the confirmation screen's two refusals, the
// official form's template failure, the Belege upload hint and a failed read, the Bescheid's unsaved warning, the
// deadline banner's load failure and the interview's answer failures, each in the real app against the real API.
//
//   * Payment (fake provider, PAYMENT_FAKE_PROVIDER=1): a cancelled return says nothing was paid; a successful return
//     says „wird bestätigt“ until the signed paid event reaches the real webhook. The 60-second confirmation window
//     (PAYMENT_CONFIRM_TIMEOUT_MS in apps/mobile-web/src/screens/shared/usePaymentConfirmation.ts) is passed with
//     Playwright's browser clock (`page.clock.fastForward`), not waited out: the time-out text and „Erneut prüfen“
//     appear, „Erneut prüfen“ opens a fresh window, and the paid event then turns the page to „Zahlung bestätigt“.
//   * Confirmation: a value that changes after the screen was drawn makes the real API refuse with 409
//     CONFIRMATION_STALE („veraendert“); a 503 on the confirm PUT shows the failure („fehler“); neither confirms
//     anything, and the same button confirms once the endpoint answers again.
//   * Load and save failures the real server cannot produce on demand (a 5xx on one read or one write) are made with
//     `page.route` on exactly that endpoint; the route is removed and the retry shows the real data.
//
// Needs the browser-gates job: SELBSTSTAENDIGE_ENABLED=false is fine (the standard tier), PAYMENT_FAKE_PROVIDER=1.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, putLstb, putPrintableBasics, browserLogin, until } from '../harness/api-account.mjs'
import { deliverFakePaymentEvent, latestFakeCheckoutSession } from '../harness/fake-payment.mjs'
import { snapshotPage } from '../harness/failure-snapshot.mjs'
import { renderTextPdf } from '../fixtures/synthetic-documents.mjs'

const TAG = 'beta-payment-printout-states'
const YEAR = 2025
/** The running year: the confirmation states use it, so the printable YEAR stays free of unconfirmed values. */
const CONFIRM_YEAR = 2026
/** A fresh year of this account whose first interview question is still open. */
const INTERVIEW_YEAR = 2024
/** usePaymentConfirmation.ts: PAYMENT_CONFIRM_TIMEOUT_MS (60 s); one second more passes it. */
const PAST_CONFIRM_WINDOW_MS = 61_000

// apps/mobile-web/src/i18n/locales/de.json
const DE = {
  abgebrochen: 'Die Zahlung wurde abgebrochen, es wurde nichts bezahlt. Du kannst es jederzeit erneut versuchen.',
  wirdBestaetigt: 'Deine Zahlung wird bestätigt. Das dauert meist nur Sekunden – du musst nichts weiter tun.',
  zeitUeberschritten: `Die Bestätigung dauert länger als üblich. Hast du bezahlt, schalten wir ${YEAR} frei, sobald die Zahlung bei uns eingeht. Ein zweites Mal bezahlen musst du nicht.`,
  erneutPruefen: 'Erneut prüfen',
  bestaetigt: `Zahlung bestätigt: ${YEAR} ist freigeschaltet.`,
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  veraendert: 'Seit du die Werte gesehen hast, hat sich etwas geändert. Prüf sie bitte noch einmal.',
  vorlageLadefehler: 'Der Vordruck konnte nicht geladen werden.',
  retry: 'Noch mal versuchen',
  uploadGrenze: 'PDF, JPG, PNG oder WebP, höchstens 10 MB je Datei.',
  zuGross: 'Die Datei ist zu groß. Erlaubt sind höchstens 10 MB.',
  unsavedLeave: 'Eine Eingabe ist noch nicht gespeichert. Tipp noch einmal, um trotzdem zu gehen.',
  fristenLadefehler: 'Deine Abgabefrist konnte nicht geladen werden.',
  postErrorFailed: 'Deine Antwort ist nicht gespeichert, die Frage steht deshalb noch einmal da.',
  postErrorNetwork: 'Deine Antwort konnte nicht gespeichert werden. Prüf die Verbindung und versuch es noch mal.',
}
/** ReceiptPickerButton.tsx: RECEIPT_ACCEPT, the four types the upload hint names. */
const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'
/** PRODUCT_LIMITS.receiptFileBytes in packages/core: 10 MiB. */
const RECEIPT_FILE_BYTES = 10 * 1024 * 1024

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  let page = null
  try {
    // --- One persona: 2025 printable and unpaid, 2026 with taken-over (unconfirmed) LStB values ------------------
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await putPrintableBasics(api, { firstName: 'Lene', lastName: 'Zustandsreich' })
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig'], ['dhf', 'Nein'], ['umzug', 'Nein'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein'], ['nebenjob', 'Nein'], ['einkuenfte', 'Nein'], ['spenden', 'Nein'], ['kv-pv', 'Nein'], ['riester', 'Nein']])
    await putLstb(api, YEAR, 45_000, 6_100, 9_200)
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace: null })
    const check = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ausdruck/pruefung`)
    if (check.missing.length > 0) fail(`the persona must be printable, still missing: ${check.missing.join(', ')}`)
    const unlockStatus = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)).status
    if ((await unlockStatus()) !== 'offen') fail('with the fake provider the unlock must be "offen" before paying')
    await answer(api, CONFIRM_YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await call(api, 'POST', `/v1/steuerjahre/${CONFIRM_YEAR}/uebernahme?von=${YEAR}`)
    const anlageN = async () => (await call(api, 'GET', `/v1/steuerjahre/${CONFIRM_YEAR}/bestaetigung`)).annexes.find((a) => a.annex === 'anlageN')
    if (!((await anlageN())?.unconfirmed > 0)) fail(`the take-over into ${CONFIRM_YEAR} must leave unconfirmed Anlage N values`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    const cors = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
    const answer503 = (route) => route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable' }) })
    const only = (method, handler) => (route) => (route.request().method() === method ? handler(route) : route.continue())
    const byId = (id) => page.locator(`[data-testid="${id}"]`)
    const see = (id) => byId(id).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(`${id} should be visible`))
    const gone = (id) => byId(id).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => fail(`${id} should be gone`))
    const textOf = async (id) => ((await byId(id).textContent()) ?? '').replace(/ /g, ' ').trim()
    const expectText = async (id, expected) => {
      await see(id)
      const text = await textOf(id)
      if (text !== expected) fail(`${id} must say "${expected}", says "${text}"`)
    }
    const expectContains = async (id, expected) => {
      await see(id)
      const text = await textOf(id)
      if (!text.includes(expected)) fail(`${id} must contain "${expected}", says "${text}"`)
    }

    // --- Fristen-Banner: the deadline read fails, the banner says so; „Noch mal versuchen“ loads the real one ----------
    const deadlines = new RegExp(`/v1/steuerjahre/${YEAR}/fristen$`)
    await page.route(deadlines, only('GET', answer503))
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await byId(`jahr-${YEAR}`).click()
    await expectContains('fristen-ladefehler', `${DE.fristenLadefehler} ${DE.server}`)
    if ((await page.locator('[data-testid^="fristen-banner-"]').count()) !== 0) fail('a deadline that did not load must not show a banner level')
    await page.unroute(deadlines)
    await Promise.all([page.waitForResponse((r) => deadlines.test(new URL(r.url()).pathname) && r.status() === 200, { timeout: 15_000 }), byId('fristen-ladefehler-erneut').click()])
    await gone('fristen-ladefehler')
    await page.locator('[data-testid^="fristen-banner-"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('after the retry the real deadline banner must appear'))
    console.log(`[${TAG}] ✅ fristen-ladefehler — a 503 on /fristen is said, the retry shows the real ${YEAR} banner`)

    // --- Interview: a failed answer POST (500) and a lost connection; the question stays, nothing is stored -----------
    const answersPost = /\/interview\/antworten$/
    const storedJob = async () => (await call(api, 'GET', `/v1/steuerjahre/${INTERVIEW_YEAR}/interview`)).answers?.job
    if ((await storedJob()) !== undefined) fail(`${INTERVIEW_YEAR} must start without an answer to its first question`)
    const jobOption = byId('interview-option-job-Angestellt')
    await page.route(answersPost, only('POST', (route) => route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }) })))
    await page.goto(`${webOrigin}/app/steuerjahr/${INTERVIEW_YEAR}/interview`, { waitUntil: 'networkidle' })
    await jobOption.waitFor({ state: 'visible', timeout: 15_000 })
    await Promise.all([page.waitForResponse((r) => answersPost.test(r.url()) && r.request().method() === 'POST', { timeout: 15_000 }), jobOption.click()])
    await expectText('post-error-failed', `${DE.server} ${DE.postErrorFailed}`)
    await see('interview-option-job-Angestellt')
    if ((await storedJob()) !== undefined) fail('a failed answer POST must not store the answer')
    await page.unroute(answersPost)
    await ctx.setOffline(true)
    await jobOption.click()
    await expectText('post-error-network', DE.postErrorNetwork)
    await ctx.setOffline(false)
    if ((await storedJob()) !== undefined) fail('an answer sent offline must not be stored')
    await jobOption.click()
    await until(storedJob, 'Angestellt', 'once the endpoint answers the same click must store the answer', 15_000)
    console.log(`[${TAG}] ✅ post-error-failed / post-error-network — the question stays, nothing stored, the next click stores it`)

    // --- Bescheid: a field save fails; „Fertig“ keeps the user once and says so, the second press leaves --------------
    const assessmentField = new RegExp(`/v1/steuerjahre/${YEAR}/bescheid/feld/[^/?]+$`)
    await page.route(assessmentField, only('PUT', answer503))
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/bescheid`, { waitUntil: 'networkidle' })
    const taxField = byId('bescheid-feld-festgesetzteSteuer')
    await taxField.waitFor({ state: 'visible', timeout: 15_000 })
    await taxField.fill('5100')
    await Promise.all([page.waitForResponse((r) => assessmentField.test(new URL(r.url()).pathname) && r.status() === 503, { timeout: 15_000 }), taxField.blur()])
    await byId('bescheid-fertig').click()
    await expectText('bescheid-ungespeichert', DE.unsavedLeave)
    if (!new URL(page.url()).pathname.endsWith(`/steuerjahr/${YEAR}/bescheid`)) fail(`after a failed save „Fertig“ must keep the user on the Bescheid once, now at ${page.url()}`)
    const recorded = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/bescheid`)).fields.find((f) => f.id === 'festgesetzteSteuer')
    if (recorded?.kind === 'erfasst') fail('the failed save must not have stored the Festgesetzte Einkommensteuer')
    if ((await taxField.inputValue()).replace(/\D/g, '') !== '5100') fail('the typed amount must stay in the field after the failed save')
    await page.unroute(assessmentField)
    await byId('bescheid-fertig').click()
    await page.waitForURL((u) => !u.pathname.endsWith('/bescheid'), { timeout: 15_000 }).catch(() => fail('the second press of „Fertig“ must leave the Bescheid'))
    console.log(`[${TAG}] ✅ bescheid-ungespeichert — the first „Fertig“ warns and stays, nothing stored, the second leaves`)

    // --- Confirmation: a value changed after drawing (real 409), then a 503 on the confirm PUT; nothing confirmed -----
    await page.goto(`${webOrigin}/app/steuerjahr/${CONFIRM_YEAR}/bestaetigung`, { waitUntil: 'networkidle' })
    const confirmN = byId('bestaetige-anlageN')
    await confirmN.waitFor({ state: 'visible', timeout: 15_000 })
    // The screen is drawn; the gross wage changes behind it (another tab, the assistant).
    await call(api, 'PUT', `/v1/steuerjahre/${CONFIRM_YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 46_500 })
    const openBefore = (await anlageN()).unconfirmed
    const confirmPut = new RegExp(`/v1/steuerjahre/${CONFIRM_YEAR}/bestaetigung/anlagen/anlageN$`)
    const confirmAnswer = (status) => page.waitForResponse((r) => confirmPut.test(new URL(r.url()).pathname) && r.request().method() === 'PUT' && r.status() === status, { timeout: 15_000 })
    await Promise.all([confirmAnswer(409), confirmN.click()])
    await expectText('bestaetigung-veraendert', DE.veraendert)
    if ((await anlageN()).unconfirmed !== openBefore) fail('a stale confirmation must confirm nothing')
    console.log(`[${TAG}] ✅ bestaetigung-veraendert — the real API refused the stale confirmation (409), nothing confirmed`)

    await page.route(confirmPut, only('PUT', answer503))
    await confirmN.waitFor({ state: 'visible', timeout: 15_000 })
    await Promise.all([confirmAnswer(503), confirmN.click()])
    await expectText('bestaetigung-fehler', DE.server)
    await gone('bestaetigung-veraendert')
    if ((await anlageN()).unconfirmed !== openBefore) fail('a failed confirmation must confirm nothing')
    await page.unroute(confirmPut)
    await Promise.all([confirmAnswer(200), confirmN.click()])
    await gone('bestaetige-anlageN')
    await gone('bestaetigung-fehler')
    if ((await anlageN())?.unconfirmed) fail('once the endpoint answers the same button must confirm Anlage N')
    console.log(`[${TAG}] ✅ bestaetigung-fehler — a 503 is said, nothing confirmed; the same button then confirms`)

    // --- Official form: the template read fails, „Noch mal versuchen“ loads and draws it -------------------------------
    const template = /\/ausdruck\/vorlage\/[^/?]+$/
    await page.route(template, only('GET', answer503))
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/formular/anlage-n`, { waitUntil: 'networkidle' })
    await expectContains('acro-vorlage-fehler', `${DE.vorlageLadefehler} ${DE.server}`)
    if ((await byId('acro-vorlage-fehler').count()) !== 1) fail('exactly one form viewer must say its template failed')
    await expectText('acro-vorlage-erneut', DE.retry)
    await page.unroute(template)
    await Promise.all([page.waitForResponse((r) => template.test(new URL(r.url()).pathname) && r.status() === 200, { timeout: 15_000 }), byId('acro-vorlage-erneut').click()])
    await gone('acro-vorlage-fehler')
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some((c) => c.width > 0 && c.height > 0), null, { timeout: 30_000 }).catch(() => fail('after the retry the Vordruck must be drawn'))
    console.log(`[${TAG}] ✅ acro-vorlage-fehler / acro-vorlage-erneut — a 503 is said, the retry draws the Vordruck`)

    // --- Belege: the hint names what the picker accepts and the limit the server holds; a failed read is said ---------
    const receiptCount = async () => (await call(api, 'GET', '/v1/belege?limit=50')).items.length
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await expectText('belege-upload-grenze', DE.uploadGrenze)
    const accept = await byId('belege-file-input').getAttribute('accept')
    if (accept !== RECEIPT_ACCEPT) fail(`the picker must accept exactly the types the hint names (${RECEIPT_ACCEPT}), accepts "${accept}"`)
    const before = await receiptCount()
    // One byte over the limit the hint names: the server refuses it and stores nothing.
    const oversized = Buffer.alloc(RECEIPT_FILE_BYTES + 1)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized)
    const [refused] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/v1/belege/upload') && r.request().method() === 'POST', { timeout: 60_000 }),
      byId('belege-file-input').setInputFiles({ name: 'zu-gross.png', mimeType: 'image/png', buffer: oversized }),
    ])
    const refusal = await refused.json().catch(() => ({}))
    if (refused.status() !== 413 || refusal.code !== 'RECEIPT_FILE_TOO_LARGE') fail(`a file over 10 MB must be refused with 413 RECEIPT_FILE_TOO_LARGE, got ${refused.status()} ${JSON.stringify(refusal).slice(0, 200)}`)
    if ((await receiptCount()) !== before) fail('a file over the limit must not be stored')
    // WEB-10: the refusal names the limit, not "check the marked fields".
    await expectText('belege-upload-status', DE.zuGross)
    console.log(`[${TAG}] ✅ belege-upload-grenze — the hint, the picker's types and the server's 10 MB limit agree`)

    const parse = /\/v1\/belege\/parse$/
    await page.route(parse, only('POST', answer503))
    const receiptPdf = await renderTextPdf(browser, ['Quittung', 'Fachbuchhandlung Beispiel', 'Fachbuch Steuerrecht 39,90 EUR', `Datum 12.03.${YEAR}`])
    await Promise.all([
      page.waitForResponse((r) => parse.test(new URL(r.url()).pathname) && r.status() === 503, { timeout: 60_000 }),
      byId('belege-file-input').setInputFiles({ name: 'quittung-fachbuch.pdf', mimeType: 'application/pdf', buffer: receiptPdf }),
    ])
    const receiptId = (await call(api, 'GET', '/v1/belege?limit=50')).items.find((r) => r.fileName === 'quittung-fachbuch.pdf')?.id
    if (!receiptId) fail('the receipt must be stored even though reading it failed')
    await expectText(`receipt-${receiptId}-lesefehler`, DE.server)
    await page.unroute(parse)
    console.log(`[${TAG}] ✅ receipt-<id>-lesefehler — the stored Beleg says its read failed (503 on /belege/parse)`)

    // --- Printout payment: cancelled, being confirmed, timed out, re-checked, confirmed ------------------------------
    const printout = `${webOrigin}/app/steuerjahr/${YEAR}/ausdruck`
    await page.goto(`${printout}?zahlung=abbruch`, { waitUntil: 'networkidle' })
    await expectText('zahlung-abgebrochen', DE.abgebrochen)
    if ((await unlockStatus()) !== 'offen') fail('a cancelled return must leave the year unpaid')
    await see('ausdruck-bezahlen')
    if ((await byId('ausdruck-bezahlen').getAttribute('aria-disabled')) === 'true') fail('after a cancel paying must be offered again')
    console.log(`[${TAG}] ✅ zahlung-abgebrochen — nothing paid, paying is offered again`)

    // The browser clock moves the confirmation window; time flows on its own otherwise. Installed before the
    // checkout's redirect, so the page that waits for the webhook runs on it from its first timer.
    await page.clock.install()
    await byId('ausdruck-bezahlen').click()
    await page.waitForURL((u) => u.pathname.endsWith('/ausdruck') && u.search.includes('zahlung=erfolg'), { timeout: 15_000 })
    await expectText('zahlung-wird-bestaetigt', DE.wirdBestaetigt)
    if ((await byId('ausdruck-bezahlen').getAttribute('aria-disabled')) !== 'true') fail('while the payment is being confirmed paying again must be disabled')
    await page.clock.fastForward(PAST_CONFIRM_WINDOW_MS)
    await expectText('zahlung-zeit-ueberschritten', DE.zeitUeberschritten)
    await gone('zahlung-wird-bestaetigt')
    if ((await unlockStatus()) !== 'offen') fail('the time-out must not unlock anything')
    console.log(`[${TAG}] ✅ zahlung-zeit-ueberschritten — past the 60 s window without the webhook the page says so`)

    await expectText('zahlung-erneut-pruefen', DE.erneutPruefen)
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/v1/steuerjahre/${YEAR}/freischaltung`) && r.status() === 200, { timeout: 15_000 }), byId('zahlung-erneut-pruefen').click()])
    await expectText('zahlung-wird-bestaetigt', DE.wirdBestaetigt)
    await gone('zahlung-zeit-ueberschritten')
    console.log(`[${TAG}] ✅ zahlung-erneut-pruefen — reads the status again and opens a fresh confirmation window`)

    const sessionId = latestFakeCheckoutSession(sql, { taxYear: YEAR, tier: 'standard' }, fail)
    const paid = await deliverFakePaymentEvent(api, apiOrigin, sessionId)
    if (!paid.ok()) fail(`the signed paid event must be accepted, got ${paid.status()}`)
    await until(unlockStatus, 'freigeschaltet', 'the paid event must unlock the year')
    await expectText('zahlung-bestaetigt', DE.bestaetigt)
    await gone('zahlung-wird-bestaetigt')
    await see('ausdruck-herunterladen')
    console.log(`[${TAG}] ✅ zahlung-bestaetigt — the polling sees the webhook's unlock, the download is offered`)

    // A cancel trip on a paid year is no cancel: nothing to say.
    await page.goto(`${printout}?zahlung=abbruch`, { waitUntil: 'networkidle' })
    await see('ausdruck-herunterladen')
    if ((await byId('zahlung-abgebrochen').count()) !== 0) fail('a paid year must not say the payment was cancelled')
    console.log(`[${TAG}] ✅ zahlung-abgebrochen stays away once the year is paid`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — payment return trip, confirmation refusals, template, Belege, Bescheid, Fristen and interview failure states verified.`)
  } catch (error) {
    if (page) await snapshotPage(page, TAG)
    throw error
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
