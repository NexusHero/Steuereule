// Beta readiness (PR #581) — the self-employment tier's checkout and its return trip to the ELSTER fill-in help, the
// fill-in help's unconfirmed-values note, and two load failures of the self-employed area, in the real app against
// the real API. Needs the self-employment switch on (the e2e-self-employed job: SELBSTSTAENDIGE_ENABLED=true,
// PAYMENT_FAKE_PROVIDER=1); with the switch off every /selbststaendig route answers SELF_EMPLOYMENT_DISABLED.
//
//   * Checkout page: the price shown is the one the unlock status names (89,99 € with the fake provider); a paid
//     year is refused by the real API (409 ALREADY_PAID) and the page leads to the fill-in help instead; the real
//     per-account throttle (CHECKOUT_THROTTLE, 10 per 10 min) refuses with 429 and the page says so. „Ausstehend“
//     (409 PAYMENT_PENDING) is the one refusal the fake provider cannot produce — its sessions are only ever open or
//     closed (apps/api/src/unlock/fake-payment-provider.ts, lookupCheckout) — so that one answer is served by
//     `page.route`, on the unpaid year where it can really occur with a pending SEPA debit.
//   * Return trip: „wird bestätigt“, then past the 60-second window (usePaymentConfirmation.ts,
//     PAYMENT_CONFIRM_TIMEOUT_MS) moved by Playwright's browser clock the time-out and „Erneut prüfen“; the re-check
//     opens a fresh window and the signed paid event on the real webhook unlocks the year.
//   * The fill-in help names values the user has not confirmed (a take-over from the year before) and stops naming
//     them once they are confirmed under „Prüfen & bestätigen“.
//   * Load failures (asset catalogue, Verfahrensdokumentation): a 503 on exactly that read through `page.route`;
//     the route is removed and the real data appears.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { deliverFakePaymentEvent, latestFakeCheckoutSession } from '../harness/fake-payment.mjs'
import { snapshotPage } from '../harness/failure-snapshot.mjs'

const TAG = 'beta-elster-states'
const YEAR = 2025
const LAST_YEAR = 2024
/** usePaymentConfirmation.ts: PAYMENT_CONFIRM_TIMEOUT_MS (60 s); one second more passes it. */
const PAST_CONFIRM_WINDOW_MS = 61_000
/** CHECKOUT_THROTTLE in apps/api/src/rate-limit/rate-limit.ts: at most 10 checkout starts per account in 10 min. */
const CHECKOUT_LIMIT = 10

// apps/mobile-web/src/i18n/locales/de.json
const DE = {
  ausstehend: `Deine Zahlung ist noch in Bearbeitung, etwa eine Lastschrift. Sobald sie eingeht, schalten wir ${YEAR} frei.`,
  schonBezahlt: `${YEAR} ist schon freigeschaltet.`,
  zuVieleVersuche: 'Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.',
  ausfuellhilfe: 'ELSTER-Ausfüllhilfe',
  wirdBestaetigt: 'Deine Zahlung wird bestätigt. Das dauert meist nur Sekunden – du musst nichts weiter tun.',
  zeitUeberschritten: `Die Bestätigung dauert länger als üblich. Hast du bezahlt, schalten wir ${YEAR} frei, sobald die Zahlung bei uns eingeht. Ein zweites Mal bezahlen musst du nicht.`,
  erneutPruefen: 'Erneut prüfen',
  bestaetigt: `Zahlung bestätigt: ${YEAR} ist freigeschaltet.`,
  unbestaetigt: 'Dein Assistent hat Werte eingetragen, die du noch nicht bestätigt hast. Die Formulare der Erklärung zeigt die Ausfüllhilfe erst, wenn du sie unter „Prüfen & bestätigen“ bestätigt hast.',
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  retry: 'Noch mal versuchen',
}

const euro = (cents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/ /g, ' ')

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  let page = null
  try {
    // --- A self-employed persona for YEAR; the capital income of LAST_YEAR is taken over, so it waits unconfirmed ---
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, LAST_YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await call(api, 'PUT', `/v1/steuerjahre/${LAST_YEAR}/kapital/kapitalertraege`, { kind: 'erfasst', value: 1_500 })
    await answer(api, YEAR, [['job', 'Selbstständig'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await call(api, 'POST', `/v1/steuerjahre/${YEAR}/uebernahme?von=${LAST_YEAR}`)
    const unlock = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)
    if (unlock.status !== 'offen' || unlock.tier !== 'selbststaendig' || !unlock.price) fail(`the year must be open at the self-employment tier with a price, got ${JSON.stringify(unlock)}`)
    const unlockStatus = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)).status
    const elsterList = () => call(api, 'GET', `/v1/steuerjahre/${YEAR}/selbststaendig/elster`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    const cors = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
    const answerJson = (status, body) => (route) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    const answer503 = answerJson(503, { statusCode: 503, message: 'Service Unavailable' })
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
    const area = (slug) => page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/selbststaendig/${slug}`, { waitUntil: 'networkidle' })
    const checkoutPath = new RegExp(`/v1/steuerjahre/${YEAR}/selbststaendig/checkout$`)
    const checkoutAnswer = (status) => page.waitForResponse((r) => checkoutPath.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.status() === status, { timeout: 15_000 })
    const pay = byId('checkout-selbststaendig')
    const disabled = async () => (await pay.getAttribute('aria-disabled')) === 'true'

    // --- Checkout page before paying: the price of the tier, and a payment still being settled ---------------------
    await area('freischalten')
    await see('freischalten-seite')
    await expectText('checkout-preis', `Preis: ${euro(unlock.price.amountCents)} einmalig für ${YEAR}.`)
    console.log(`[${TAG}] ✅ checkout-preis — the page names the price the unlock status reports (${euro(unlock.price.amountCents)})`)

    await page.route(checkoutPath, only('POST', answerJson(409, { statusCode: 409, code: 'PAYMENT_PENDING', message: 'Eine Zahlung für dieses Steuerjahr wird noch bestätigt.' })))
    await Promise.all([checkoutAnswer(409), pay.click()])
    await expectText('checkout-ausstehend', DE.ausstehend)
    if (!new URL(page.url()).pathname.endsWith('/selbststaendig/freischalten')) fail('a pending payment must not leave the checkout page')
    if (await disabled()) fail('a pending payment must leave the checkout button usable')
    if ((await unlockStatus()) !== 'offen') fail('a pending payment must not unlock the year')
    await page.unroute(checkoutPath)
    console.log(`[${TAG}] ✅ checkout-ausstehend — PAYMENT_PENDING is said, the page stays, nothing unlocked`)

    // --- Paying: the return trip waits for the webhook; past its window it says so; „Erneut prüfen“ waits again -----
    // The browser clock moves the 60-second window; installed before the checkout's redirect, so the ELSTER page
    // runs on it from its first timer. Time flows on its own otherwise.
    await page.clock.install()
    await pay.click()
    await page.waitForURL((u) => u.pathname.endsWith('/selbststaendig/elster') && u.search.includes('zahlung=erfolg'), { timeout: 15_000 })
    await expectText('elster-zahlung-wird-bestaetigt', DE.wirdBestaetigt)
    await page.clock.fastForward(PAST_CONFIRM_WINDOW_MS)
    await expectText('elster-zahlung-zeit-ueberschritten', DE.zeitUeberschritten)
    await gone('elster-zahlung-wird-bestaetigt')
    if ((await unlockStatus()) !== 'offen') fail('the time-out must not unlock anything')
    console.log(`[${TAG}] ✅ elster-zahlung-zeit-ueberschritten — past the 60 s window without the webhook the help says so`)

    await expectText('elster-zahlung-erneut-pruefen', DE.erneutPruefen)
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/v1/steuerjahre/${YEAR}/freischaltung`) && r.status() === 200, { timeout: 15_000 }), byId('elster-zahlung-erneut-pruefen').click()])
    await expectText('elster-zahlung-wird-bestaetigt', DE.wirdBestaetigt)
    await gone('elster-zahlung-zeit-ueberschritten')
    console.log(`[${TAG}] ✅ elster-zahlung-erneut-pruefen — reads the status again and opens a fresh confirmation window`)

    const sessionId = latestFakeCheckoutSession(sql, { taxYear: YEAR, tier: 'selbststaendig' }, fail)
    const paid = await deliverFakePaymentEvent(api, apiOrigin, sessionId)
    if (!paid.ok()) fail(`the signed paid event must be accepted, got ${paid.status()}`)
    await until(unlockStatus, 'freigeschaltet', 'the paid event must unlock the year')
    await expectText('elster-freigeschaltet', DE.bestaetigt)
    await gone('elster-zahlung-wird-bestaetigt')
    console.log(`[${TAG}] ✅ the polling sees the webhook's unlock — the help says the year is unlocked`)

    // --- Unconfirmed values: the help says the return's forms wait for „Prüfen & bestätigen“ ------------------------
    await expectText('elster-unbestaetigt', DE.unbestaetigt)
    const waiting = (await elsterList()).unconfirmed
    if (!waiting.includes('unbestaetigt.anlageKap')) fail(`the taken-over capital income must be unconfirmed, the API names ${JSON.stringify(waiting)}`)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/bestaetigung`, { waitUntil: 'networkidle' })
    await byId('bestaetige-anlageKap').click()
    await gone('bestaetige-anlageKap')
    await area('elster')
    await see('elster-seite')
    await page.locator('[data-testid^="elster-formular-"], [data-testid="elster-keine-formulare"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('the fill-in help must load its forms'))
    if ((await byId('elster-unbestaetigt').count()) !== 0) fail('once confirmed the help must not name unconfirmed values any more')
    if ((await elsterList()).unconfirmed.length !== 0) fail('after „Anlage bestätigen“ the API must name no unconfirmed values')
    console.log(`[${TAG}] ✅ elster-unbestaetigt — named while the take-over waits, gone once it is confirmed`)

    // --- The paid year: the real API refuses a second checkout, the page leads to the fill-in help -------------------
    await area('freischalten')
    await see('freischalten-seite')
    await Promise.all([checkoutAnswer(409), pay.click()])
    await expectText('checkout-schon-bezahlt', DE.schonBezahlt)
    if (!(await disabled())) fail('on a paid year the checkout button must be disabled')
    await expectText('checkout-zur-ausfuellhilfe', DE.ausfuellhilfe)
    await byId('checkout-zur-ausfuellhilfe').click()
    await page.waitForURL((u) => u.pathname.endsWith('/selbststaendig/elster'), { timeout: 15_000 }).catch(() => fail('„Ausfüllhilfe“ must open the fill-in help'))
    await see('elster-seite')
    console.log(`[${TAG}] ✅ checkout-schon-bezahlt / checkout-zur-ausfuellhilfe — ALREADY_PAID is said, the button leads to the help`)

    // --- Too many checkout starts: the real per-account throttle answers 429 ------------------------------------------
    // Two starts reached the server so far (the payment and the refused one); the rest of the window is spent here.
    let throttled = false
    for (let start = 0; start < CHECKOUT_LIMIT && !throttled; start++) {
      const res = await api.post(`/v1/steuerjahre/${YEAR}/selbststaendig/checkout`)
      if (res.status() === 429) throttled = true
      else if (res.status() !== 409) fail(`a checkout start on the paid year must answer 409 or 429, got ${res.status()}`)
    }
    if (!throttled) fail(`the checkout throttle (${CHECKOUT_LIMIT} per account) never answered 429`)
    await area('freischalten')
    await see('freischalten-seite')
    await Promise.all([checkoutAnswer(429), pay.click()])
    await expectText('checkout-zu-viele', DE.zuVieleVersuche)
    if ((await byId('checkout-schon-bezahlt').count()) !== 0) fail('a throttled start must not claim the year was refused as paid')
    console.log(`[${TAG}] ✅ checkout-zu-viele — the real 429 of the checkout throttle is said`)

    // --- Assets: the catalogue read fails; the form says so, the kinds come back once it answers ----------------------
    const catalogues = new RegExp(`/v1/steuerjahre/${YEAR}/selbststaendig/kataloge$`)
    const kindSelect = byId('anlage-kategorie')
    await page.route(catalogues, only('GET', answer503))
    await area('anlagen')
    await byId('anlage-neu').click()
    await see('anlage-formular')
    await expectText('anlage-katalog-fehler', DE.server)
    if ((await kindSelect.locator('option').count()) !== 1) fail('without the catalogue the asset kind offers only „own useful life“')
    await page.unroute(catalogues)
    await Promise.all([page.waitForResponse((r) => catalogues.test(new URL(r.url()).pathname) && r.status() === 200, { timeout: 15_000 }), page.reload({ waitUntil: 'networkidle' })])
    await byId('anlage-neu').click()
    await see('anlage-formular')
    await kindSelect.locator('option[value="computer"]').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => fail('once the catalogue answers the asset kinds must be offered'))
    if ((await byId('anlage-katalog-fehler').count()) !== 0) fail('once the catalogue answers its failure note must be gone')
    console.log(`[${TAG}] ✅ anlage-katalog-fehler — a 503 on /kataloge is said, the kinds come back after a reload`)

    // --- Export: the Verfahrensdokumentation read fails, „Noch mal versuchen“ loads it ------------------------------
    const procedure = new RegExp(`/v1/steuerjahre/${YEAR}/selbststaendig/verfahrensdokumentation$`)
    await page.route(procedure, only('GET', answer503))
    await area('export')
    await see('export-verfahren')
    await expectText('verfahren-ladefehler', DE.server)
    await expectText('verfahren-erneut', DE.retry)
    await page.unroute(procedure)
    await Promise.all([page.waitForResponse((r) => procedure.test(new URL(r.url()).pathname) && r.status() === 200, { timeout: 15_000 }), byId('verfahren-erneut').click()])
    await gone('verfahren-ladefehler')
    await page.locator('[data-testid="verfahren-vollstaendig"], [data-testid="verfahren-speichern"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail('after the retry the Verfahrensdokumentation must be shown'))
    console.log(`[${TAG}] ✅ verfahren-ladefehler / verfahren-erneut — a 503 is said, the retry shows the document`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — self-employment checkout refusals, the ELSTER return trip, unconfirmed values and two load failures verified.`)
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
