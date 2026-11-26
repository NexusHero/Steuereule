// The failure, retry and input states of the data-entry masks that the beta-readiness pass (#581) added, in a
// real browser on the real stack (self-employment switch off; the business area is beta-business-states.mjs):
//  * Cockpit: a tile read that fails names the areas as unknown („Einige Bereiche …“) and its retry refetches
//    exactly the failed reads; a failed estimate says so instead of „kommt später“ (C-05, WEB-45, NC-06).
//  * Catalog: an amount the app cannot read is named at the field (WEB-12); a refused save says why and that
//    the question is back (NM-07), and the same answer goes through once the server answers again.
//  * LStB: the employer, church-tax and subsidy lines each say that they did not load, with a retry that brings
//    back the stored value (NM-15).
//  * Strom „fertig“: a failed estimate is said, not shown as „kommt, sobald deine Lohnangaben da sind“ (NM-15).
//  * Vermietung: without the household link the share question would vanish silently; the mask says so, and
//    the retry brings the question back for a couple filing jointly (NM-15).
//  * Confirmation: a taken-over value of a rental object names the object it belongs to (MCP-5).
//
// Every load failure is one read answered 503 by `page.route` (the server's own answer for a hiccup, retried by
// the app's query policy until it gives up); the route is removed before the retry, so the retry and what it
// shows are the real server's. Everything else is seeded through the real API. Invented data only.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429, authoredText } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { PASSWORD, createAccount, call, answer, putLstb, browserLogin, until, chooseJointReturn } from '../harness/api-account.mjs'
import { snapshotPage } from '../harness/failure-snapshot.mjs'

const TAG = 'beta-mask-states'
const YEAR = 2025
const NEXT_YEAR = 2026
const tid = (id) => `[data-testid="${id}"]`

// apps/mobile-web/src/i18n/locales/de.json, copied exactly.
const COPY = {
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  areasFailed: 'Einige Bereiche konnten gerade nicht geladen werden. Ihr Stand ist unbekannt, nicht offen.',
  estimateFailed: 'Die Schätzung konnte gerade nicht geladen werden.',
  estimateOpenOne: 'Für die Schätzung fehlt noch 1 Angabe.',
  estimateOpenOther: (count) => `Für die Schätzung fehlen noch ${count} Angaben.`,
  notAnAmount: 'Das ist kein Betrag. Bitte so eingeben: 948 oder 948,60.',
  answerBack: 'Deine Antwort ist nicht gespeichert, die Frage steht deshalb noch einmal da.',
  employerFailed: 'Der Arbeitgeber konnte nicht geladen werden.',
  churchTaxFailed: 'Die Kirchensteuer konnte nicht geladen werden.',
  subsidiesFailed: 'Die Zuschüsse konnten nicht geladen werden.',
  stromEstimateFailed: 'Die Schätzung konnte nicht geladen werden.',
  stromWithoutEstimate: 'Die Schätzung kommt, sobald deine Lohnangaben da sind.',
  shareFailed: 'Ob ihr gemeinsam veranlagt werdet, konnte nicht geladen werden – deshalb fehlt hier die Frage nach deinem Anteil am Objekt.',
  rentalObject: (name) => `Mietobjekt: ${name}`,
  rentalObjectWithoutAddress: 'Mietobjekt (ohne Adresse)',
}

let pageForSnapshot = null

async function visible(page, id, what, timeout = 15_000) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${what}: "${id}" should be visible`))
}

async function detached(page, id, what) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => fail(`${what}: "${id}" should be gone`))
}

async function textOf(page, id) {
  return authoredText(page.locator(tid(id)).first())
}

async function expectText(page, id, expected, what) {
  const text = await textOf(page, id)
  if (!text.includes(expected)) fail(`${what}: "${id}" should read „${expected}“, reads „${text}“`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  // A fulfilled cross-origin answer needs the CORS headers the API would send, or the browser hides it as a network error.
  const cors = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
  const unavailable = (route) => route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable' }) })
  const onlyGet = (route) => (route.request().method() === 'GET' ? unavailable(route) : route.continue())
  const api = (path) => `${apiOrigin}${path}`
  /** The real server's successful answer to `method path`, as the page receives it. */
  const realAnswer = (page, path, method = 'GET') =>
    page.waitForResponse((r) => r.url().split('?')[0] === api(path) && r.request().method() === method && r.ok(), { timeout: 15_000 }).catch(() => fail(`${method} ${path} should be answered by the server`))

  try {
    // ================================================================================================
    // Account M — a single employee in 2025: cockpit, catalog, LStB, Strom.
    // ================================================================================================
    const m = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-m` })
    await answer(m.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    const interview = await call(m.api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)
    if (interview.nextStep?.kind !== 'done') fail(`precondition: the basis of ${YEAR} should be complete, next step is ${JSON.stringify(interview.nextStep)}`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    pageForSnapshot = page
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, m.email, TAG)

    // --- Cockpit: failed areas with a retry of exactly the failed reads; a failed estimate is named -------------
    const capitalPath = `/v1/steuerjahre/${YEAR}/kapital`
    const estimatePath = `/v1/steuerjahre/${YEAR}/steuerschaetzung`
    await page.route(`**${capitalPath}`, onlyGet)
    await page.route(`**${estimatePath}`, onlyGet)
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await visible(page, 'cockpit-bereiche-fehler', 'Cockpit', 20_000)
    await expectText(page, 'cockpit-bereiche-fehler', COPY.areasFailed, 'Cockpit')
    await visible(page, 'cockpit-erstattung-fehler', 'Cockpit', 20_000)
    await expectText(page, 'cockpit-erstattung-fehler', COPY.estimateFailed, 'Cockpit')
    if (await page.locator(tid('cockpit-erstattung')).count()) fail('Cockpit: a failed estimate must not also show the refund line')
    console.log(`[${TAG}] ✅ cockpit-bereiche-fehler, cockpit-erstattung-fehler — a failed tile read and a failed estimate are named`)

    await page.unroute(`**${capitalPath}`)
    await page.unroute(`**${estimatePath}`)
    const capitalBack = realAnswer(page, capitalPath)
    const estimateBack = realAnswer(page, estimatePath)
    await page.locator(tid('cockpit-bereiche-erneut')).click()
    await Promise.all([capitalBack, estimateBack])
    await detached(page, 'cockpit-bereiche-fehler', 'Cockpit retry')
    await detached(page, 'cockpit-erstattung-fehler', 'Cockpit retry')
    const estimate = await call(m.api, 'GET', estimatePath)
    if (estimate.kind !== 'offen' || estimate.missing?.includes('veranlagungsart')) fail(`precondition: without a wage the estimate of ${YEAR} should be open, is ${JSON.stringify(estimate).slice(0, 200)}`)
    const openCount = estimate.missing?.length ?? 0
    await visible(page, 'cockpit-erstattung', 'Cockpit retry')
    await expectText(page, 'cockpit-erstattung', openCount === 1 ? COPY.estimateOpenOne : COPY.estimateOpenOther(openCount), 'Cockpit retry')
    console.log(`[${TAG}] ✅ cockpit-bereiche-erneut — refetches the failed reads; the areas and the estimate („${openCount} offen“) come back`)

    // --- Catalog: an unreadable amount, then a refused save, then the same answer stored ------------------------------
    const answersPath = `/v1/steuerjahre/${YEAR}/interview/antworten`
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/katalog/sonderausgaben`, { waitUntil: 'networkidle' })
    const donationYes = realAnswer(page, answersPath, 'POST')
    await page.locator(tid('katalog-option-spenden-Ja')).click()
    await donationYes
    const amount = page.locator(tid('katalog-input-spenden-betrag'))
    await visible(page, 'katalog-input-spenden-betrag', 'Catalog')
    await amount.fill('zwölf Euro')
    await page.locator(tid('katalog-submit-spenden-betrag')).click()
    await visible(page, 'katalog-unlesbar-spenden-betrag', 'Catalog')
    await expectText(page, 'katalog-unlesbar-spenden-betrag', COPY.notAnAmount, 'Catalog')
    const storedAnswers = async () => (await call(m.api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)).answers ?? {}
    if ((await storedAnswers())['spenden-betrag'] !== undefined) fail('Catalog: an unreadable amount must not be stored')
    console.log(`[${TAG}] ✅ katalog-unlesbar-spenden-betrag — „zwölf Euro“ is named as no amount and not stored`)

    await page.route(`**${answersPath}`, (route) => (route.request().method() === 'POST' ? unavailable(route) : route.continue()))
    await amount.fill('250')
    await page.locator(tid('katalog-submit-spenden-betrag')).click()
    await visible(page, 'katalog-speichern-fehler', 'Catalog save')
    await expectText(page, 'katalog-speichern-fehler', `${COPY.server} ${COPY.answerBack}`, 'Catalog save')
    await visible(page, 'katalog-input-spenden-betrag', 'Catalog save (the question is back)')
    if ((await storedAnswers())['spenden-betrag'] !== undefined) fail('Catalog save: a refused answer must not be stored')
    await page.unroute(`**${answersPath}`)
    await amount.fill('250')
    const saved = realAnswer(page, answersPath, 'POST')
    await page.locator(tid('katalog-submit-spenden-betrag')).click()
    await saved
    await detached(page, 'katalog-speichern-fehler', 'Catalog save retry')
    await until(async () => (await storedAnswers())['spenden-betrag'], '250', 'Catalog save retry: the same answer should be stored once the server answers')
    console.log(`[${TAG}] ✅ katalog-speichern-fehler — a refused save says so and the question is back; the next try stores 250 €`)

    // --- LStB: the three optional lines say that they did not load, and their retry brings the stored value ---------
    await putLstb(m.api, YEAR, 42_000, 5_600, 8_600)
    await call(m.api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb-arbeitgeber`, { arbeitgeber: 'Muster Logistik GmbH' })
    await call(m.api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb-kirchensteuer`, { kirchensteuer: 312, kirchensteuerEhegatte: null })
    await call(m.api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb-zuschuesse`, { zuschuesseKvPv: 1_200 })
    const lines = [
      { id: 'lstb-arbeitgeber-ladefehler', path: `/v1/steuerjahre/${YEAR}/lstb-arbeitgeber`, what: COPY.employerFailed, input: 'lstb-arbeitgeber', value: 'Muster Logistik GmbH' },
      { id: 'lstb-kirchensteuer-ladefehler', path: `/v1/steuerjahre/${YEAR}/lstb-kirchensteuer`, what: COPY.churchTaxFailed, input: 'lstb-kirchensteuer', value: '312' },
      { id: 'lstb-zuschuesse-ladefehler', path: `/v1/steuerjahre/${YEAR}/lstb-zuschuesse`, what: COPY.subsidiesFailed, input: 'lstb-zuschuesse', value: '1200' },
    ]
    for (const line of lines) await page.route(`**${line.path}`, onlyGet)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    await visible(page, 'lstb-bruttoarbeitslohn', 'LStB')
    for (const line of lines) {
      await visible(page, line.id, 'LStB', 20_000)
      await expectText(page, line.id, `${line.what} ${COPY.server}`, 'LStB')
      if (await page.locator(tid(line.input)).count()) fail(`LStB: "${line.input}" must not be offered while its line did not load`)
    }
    for (const line of lines) await page.unroute(`**${line.path}`)
    for (const line of lines) {
      const back = realAnswer(page, line.path)
      await page.locator(tid(`${line.id}-erneut`)).click()
      await back
      await detached(page, line.id, 'LStB retry')
      await visible(page, line.input, 'LStB retry')
      const shown = await page.locator(tid(line.input)).inputValue()
      if (shown !== line.value) fail(`LStB retry: "${line.input}" should show the stored ${line.value}, shows "${shown}"`)
    }
    console.log(`[${TAG}] ✅ lstb-arbeitgeber/kirchensteuer/zuschuesse-ladefehler — each line names its failure; „Noch mal versuchen“ brings the stored value`)

    // --- Strom „fertig“: a failed estimate is said; the retry shows the real estimate ---------------------------------
    await page.route(`**${estimatePath}`, onlyGet)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/strom/fertig`, { waitUntil: 'networkidle' })
    await visible(page, 'strom-schritt-fertig', 'Strom')
    await visible(page, 'strom-schaetzung-ladefehler', 'Strom', 20_000)
    await expectText(page, 'strom-schaetzung-ladefehler', `${COPY.stromEstimateFailed} ${COPY.server}`, 'Strom')
    await page.unroute(`**${estimatePath}`)
    const stromBack = realAnswer(page, estimatePath)
    await page.locator(tid('strom-schaetzung-ladefehler-erneut')).click()
    await stromBack
    await detached(page, 'strom-schaetzung-ladefehler', 'Strom retry')
    // What the hero says for the server's estimate (StromScreen refundLine): the range's label, else „kommt, sobald …“.
    const wageEstimate = await call(m.api, 'GET', estimatePath)
    const range = wageEstimate.kind === 'spanne' ? wageEstimate.result : null
    const label =
      range == null ? COPY.stromWithoutEstimate : range.from >= 0 ? 'Voraussichtliche Erstattung' : range.to <= 0 ? 'Voraussichtliche Nachzahlung' : 'Voraussichtliches Ergebnis'
    await expectText(page, 'strom-fertig-erstattung', label, 'Strom retry')
    console.log(`[${TAG}] ✅ strom-schaetzung-ladefehler — the failed estimate is said; the retry shows „${label}“`)
    await ctx.close()
    await m.api.dispose()

    // ================================================================================================
    // Account R — a couple filing jointly with a rental object in 2025, taken over into 2026.
    // ================================================================================================
    const r = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-r` })
    await call(r.api, 'PUT', '/v1/stammdaten', { familienstand: 'verheiratet' })
    await answer(r.api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet']])
    await answer(r.api, NEXT_YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet']])
    const link = await chooseJointReturn(r.api, YEAR, PASSWORD, TAG)
    if (link.filingType !== 'zusammen') fail(`precondition: the joint return of ${YEAR} should be chosen, is ${JSON.stringify(link.filingType)}`)
    const created = await call(r.api, 'POST', `/v1/steuerjahre/${YEAR}/vermietung/objekte`)
    const propertyId = created.properties?.[0]?.id
    if (typeof propertyId !== 'string') fail(`precondition: a rental object should be created, got ${JSON.stringify(created).slice(0, 200)}`)
    await call(r.api, 'PUT', `/v1/steuerjahre/${YEAR}/vermietung/objekte/${propertyId}/mieteinnahmen`, { kind: 'erfasst', value: 9_600 })

    const rctx = await newContextAtBreakpoint(browser, 'l')
    const rpage = await rctx.newPage()
    pageForSnapshot = rpage
    guardAgainst429(rpage, fail, '/api/auth/')
    await browserLogin(rpage, webOrigin, r.email, TAG)

    // --- Vermietung: the share question's missing source is said; the retry brings the question back -----------------
    const linkPath = `/v1/steuerjahre/${YEAR}/kopplung`
    await rpage.route(`**${linkPath}`, onlyGet)
    await rpage.goto(`${webOrigin}/app/steuerjahr/${YEAR}/vermietung`, { waitUntil: 'networkidle' })
    await visible(rpage, 'vermietung-0-wohnflaeche', 'Vermietung')
    await visible(rpage, 'vermietung-anteil-ladefehler', 'Vermietung', 20_000)
    await expectText(rpage, 'vermietung-anteil-ladefehler', `${COPY.shareFailed} ${COPY.server}`, 'Vermietung')
    if (await rpage.locator(tid('vermietung-0-anteilA')).count()) fail('Vermietung: the share question cannot be asked while the household link did not load')
    await rpage.unroute(`**${linkPath}`)
    const linkBack = realAnswer(rpage, linkPath)
    await rpage.locator(tid('vermietung-anteil-ladefehler-erneut')).click()
    await linkBack
    await detached(rpage, 'vermietung-anteil-ladefehler', 'Vermietung retry')
    await visible(rpage, 'vermietung-0-anteilA', 'Vermietung retry (joint return: the share question)')
    console.log(`[${TAG}] ✅ vermietung-anteil-ladefehler — the missing share question is explained; the retry asks it for the couple`)

    // --- Confirmation: a taken-over value of the rental object names its object -----------------------------------------
    await call(r.api, 'POST', `/v1/steuerjahre/${NEXT_YEAR}/uebernahme?von=${YEAR}`)
    const overview = await call(r.api, 'GET', `/v1/steuerjahre/${NEXT_YEAR}/bestaetigung`)
    const withInstance = overview.annexes.flatMap((a) => a.values).filter((v) => v.instance !== null && v.screen === 'vermietung')
    if (withInstance.length === 0) fail(`precondition: the take-over should bring the rental object's values into ${NEXT_YEAR}, got ${JSON.stringify(overview).slice(0, 300)}`)
    await rpage.goto(`${webOrigin}/app/steuerjahr/${NEXT_YEAR}/bestaetigung`, { waitUntil: 'networkidle' })
    for (const value of withInstance) {
      const id = value.person === 'B' ? `B-${value.key}` : value.key
      const hint = rpage.locator(`[data-testid="instanz-${id}"]`)
      await hint.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(`Confirmation: the taken-over ${value.key} should name its rental object`))
      const expected = value.instanceLabel?.trim() ? COPY.rentalObject(value.instanceLabel.trim()) : COPY.rentalObjectWithoutAddress
      const shown = await authoredText(hint)
      if (shown !== expected) fail(`Confirmation: the object of ${value.key} should read „${expected}“, reads „${shown}“`)
    }
    console.log(`[${TAG}] ✅ instanz-<key> — ${withInstance.length} taken-over values each name their rental object`)

    await rctx.close()
    await r.api.dispose()
    console.log(`[${TAG}] PASS — the masks' failure, retry and input states reached in the browser.`)
  } catch (error) {
    // Before the browser closes: what the page showed when the step failed (log and artifact).
    if (pageForSnapshot) await snapshotPage(pageForSnapshot, TAG)
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
