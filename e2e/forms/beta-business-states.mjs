// The failure, retry and account states of the self-employment area that the beta-readiness pass (#581) added,
// in a real browser on the real stack. Needs SELBSTSTAENDIGE_ENABLED=true (the area answers 403 with the switch
// off), so it runs next to scenario 09b on that job's stack (ATTACH mode).
//  * Overview: a failed book, bank or household read is said where its part would be (WEB-44), the further
//    businesses' failed list says so and retries (NC-17), and a link to a business that does not exist opens
//    no phantom profile but leads to the first one (NC-16).
//  * Export: a failed E-Bilanz preview says so and retries, the file button stays locked until it loaded (NC-10).
//  * Sondertarife: a failed § 16 result is said; the next save shows the server's figure.
//  * A session lost to a guest one (signed out in this browser while the area is open, WEB-44): the first read
//    of a page answers ACCOUNT_REQUIRED, the page offers the sign-in, which comes back to the same page, and the
//    account creation.
//
// Every load failure is one read answered 503 by `page.route` (the server's own answer for a hiccup); the route
// is removed before the retry, so the retry and what it shows are the real server's. The account, its business
// in Bilanz mode and a second business are seeded through the real API. Invented data only.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429, authoredText } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { submitLogin } from '../harness/flows.mjs'
import { PASSWORD, createAccount, call, answer, browserLogin } from '../harness/api-account.mjs'
import { snapshotPage } from '../harness/failure-snapshot.mjs'

const TAG = 'beta-business-states'
const YEAR = 2025
const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const AREA = `/v1/steuerjahre/${YEAR}/selbststaendig`
const tid = (id) => `[data-testid="${id}"]`

// apps/mobile-web/src/i18n/locales/de.json, copied exactly.
const COPY = {
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  accountRequired: 'Dafür brauchst du ein kostenloses Konto. Als Gast geht das nicht.',
  loadFailedHeading: 'Das hat nicht geladen',
  signIn: 'Neu anmelden',
  createAccount: 'Konto anlegen',
  unknownBusiness: (n) => `Den Betrieb ${n} gibt es in diesem Jahr nicht.`,
  toFirstBusiness: 'Zum ersten Betrieb',
  retry: 'Noch mal versuchen',
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

async function isEnabled(locator) {
  return locator.evaluate((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true')
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  // A fulfilled cross-origin answer needs the CORS headers the API would send, or the browser hides it as a network error.
  const cors = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
  const onlyGet = (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable' }) })
      : route.continue()
  /** The real server's successful answer to `method path`, as the page receives it. */
  const realAnswer = (page, path, method = 'GET') =>
    page
      .waitForResponse((r) => r.url().split('?')[0] === `${apiOrigin}${path}` && r.request().method() === method && r.ok(), { timeout: 15_000 })
      .catch(() => fail(`${method} ${path} should be answered by the server`))

  try {
    // --- Seed: a self-employed person with a business in Bilanz mode (the E-Bilanz exists only there) and a second one
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Selbstständig'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await call(api, 'PUT', AREA, { mode: 'bilanz', name: 'Atelier Nord' })
    await call(api, 'PUT', `${AREA}/verfahrensdokumentation`, { values: { steuernummer: '5133081508159' } })
    await call(api, 'POST', `${AREA}/betriebe`, { name: 'Onlineshop' })
    const preview = await call(api, 'GET', `${AREA}/e-bilanz`)
    if (typeof preview.xbrl !== 'string' || preview.xbrl === '') fail(`precondition: the E-Bilanz preview of the Bilanz business should exist, got ${JSON.stringify(preview).slice(0, 200)}`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    pageForSnapshot = page
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    const overview = `${webOrigin}/app/steuerjahr/${YEAR}/selbststaendig`

    // --- Overview: the book, the bank and the household each say that they did not load --------------------------------
    const linkPath = `/v1/steuerjahre/${YEAR}/kopplung`
    const failed = [
      { id: 'business-buch-fehler', path: `${AREA}/buch` },
      { id: 'business-bank-fehler', path: `${AREA}/bank` },
      { id: 'business-person-fehler', path: linkPath },
    ]
    for (const part of failed) await page.route(`**${part.path}`, onlyGet)
    await page.goto(overview, { waitUntil: 'networkidle' })
    await visible(page, 'selbststaendig-uebersicht', 'Overview')
    for (const part of failed) {
      await visible(page, part.id, 'Overview', 20_000)
      await expectText(page, part.id, COPY.server, 'Overview')
    }
    for (const part of failed) await page.unroute(`**${part.path}`)
    const partsBack = Promise.all(failed.map((part) => realAnswer(page, part.path)))
    await page.reload({ waitUntil: 'networkidle' })
    await partsBack
    for (const part of failed) await detached(page, part.id, 'Overview after the reads answer')
    await visible(page, 'business-status', 'Overview after the reads answer')
    console.log(`[${TAG}] ✅ business-buch-fehler, business-bank-fehler, business-person-fehler — each failed read is said; gone once it answers`)

    // --- Overview: the list of businesses failed, and its retry brings the second business ---------------------------------
    const listPath = `${AREA}/betriebe`
    await page.route(`**${listPath}`, onlyGet)
    await page.goto(overview, { waitUntil: 'networkidle' })
    await visible(page, 'business-betriebe-fehler', 'Businesses', 20_000)
    await expectText(page, 'business-betriebe-fehler', COPY.server, 'Businesses')
    await expectText(page, 'business-betriebe-erneut', COPY.retry, 'Businesses')
    if (await page.locator(tid('business-betrieb-2')).count()) fail('Businesses: a failed list must not show the second business as if it were known')
    await page.unroute(`**${listPath}`)
    const listBack = realAnswer(page, listPath)
    await page.locator(tid('business-betriebe-erneut')).click()
    await listBack
    await detached(page, 'business-betriebe-fehler', 'Businesses retry')
    await visible(page, 'business-betrieb-2', 'Businesses retry')
    await expectText(page, 'business-betrieb-2', 'Onlineshop', 'Businesses retry')
    console.log(`[${TAG}] ✅ business-betriebe-fehler, business-betriebe-erneut — the failed list is said; the retry lists „Onlineshop“`)

    // --- Overview: a link to a business that does not exist leads to the first one ----------------------------------------
    await page.goto(`${overview}?betrieb=99`, { waitUntil: 'networkidle' })
    await visible(page, 'business-betrieb-unbekannt', 'Unknown business')
    await expectText(page, 'business-betrieb-unbekannt', COPY.unknownBusiness(99), 'Unknown business')
    if (await page.locator(tid('business-status')).count()) fail('Unknown business: no profile may be shown for business 99')
    await expectText(page, 'business-betrieb-zum-ersten', COPY.toFirstBusiness, 'Unknown business')
    await page.locator(tid('business-betrieb-zum-ersten')).click()
    await page
      .waitForURL((u) => u.pathname === `/app/steuerjahr/${YEAR}/selbststaendig` && !u.searchParams.has('betrieb'), { timeout: 15_000 })
      .catch(() => fail(`Unknown business: „Zum ersten Betrieb“ should open the first business, the page is at ${page.url()}`))
    await visible(page, 'business-status', 'Unknown business → first')
    await detached(page, 'business-betrieb-unbekannt', 'Unknown business → first')
    await expectText(page, 'business-betrieb-1', 'Atelier Nord', 'Unknown business → first')
    console.log(`[${TAG}] ✅ business-betrieb-unbekannt, business-betrieb-zum-ersten — business 99 is named as unknown; the button opens „Atelier Nord“`)

    // --- Export: the E-Bilanz preview failed; the file stays locked until the retry loads it -----------------------------
    const eBilanzPath = `${AREA}/e-bilanz`
    await page.route(`**${eBilanzPath}`, onlyGet)
    await page.goto(`${overview}/export`, { waitUntil: 'networkidle' })
    await visible(page, 'export-ebilanz', 'E-Bilanz')
    await visible(page, 'ebilanz-ladefehler', 'E-Bilanz', 20_000)
    await expectText(page, 'ebilanz-ladefehler', COPY.server, 'E-Bilanz')
    if (await isEnabled(page.locator(tid('ebilanz-datei')))) fail('E-Bilanz: the file must stay locked while the preview did not load')
    await page.unroute(`**${eBilanzPath}`)
    const eBilanzBack = realAnswer(page, eBilanzPath)
    await page.locator(tid('ebilanz-erneut')).click()
    await eBilanzBack
    await detached(page, 'ebilanz-ladefehler', 'E-Bilanz retry')
    await page
      .waitForFunction(() => {
        const el = document.querySelector('[data-testid="ebilanz-datei"]')
        return el !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
      }, null, { timeout: 10_000 })
      .catch(() => fail('E-Bilanz retry: the file should be offered once the preview loaded'))
    if (preview.note) await expectText(page, 'export-ebilanz', preview.note, 'E-Bilanz retry')
    console.log(`[${TAG}] ✅ ebilanz-ladefehler, ebilanz-erneut — the failed preview is said and locks the file; the retry unlocks it`)

    // --- Sondertarife: a failed § 16 result is said; the next save shows the server's figure --------------------------
    const tariffsPath = `${AREA}/sondertarife`
    await page.route(`**${tariffsPath}`, onlyGet)
    await page.goto(`${overview}/sondertarife`, { waitUntil: 'networkidle' })
    await visible(page, 'sondertarife-seite', 'Sondertarife')
    await visible(page, 'sonder-ergebnis-fehler', 'Sondertarife', 20_000)
    await expectText(page, 'sonder-ergebnis-fehler', COPY.server, 'Sondertarife')
    await page.unroute(`**${tariffsPath}`)
    await page.locator(tid('sonder-art-veraeusserung')).click()
    await page.locator(tid('sonder-date')).fill(`${YEAR}-09-30`)
    await page.locator(tid('sonder-priceEur')).fill('200000')
    await page.locator(tid('sonder-costsEur')).fill('5000')
    await page.locator(tid('sonder-capitalAccountEur')).fill('95000')
    const tariffsBack = realAnswer(page, tariffsPath)
    await page.locator(tid('sonder-aufgabe-speichern')).click()
    await tariffsBack
    await detached(page, 'sonder-ergebnis-fehler', 'Sondertarife after the save')
    await visible(page, 'sonder-steuerpflichtig', 'Sondertarife after the save')
    const tariffs = await call(api, 'GET', tariffsPath)
    const taxableCents = Math.round((tariffs.disposal?.taxableGainEur ?? NaN) * 100)
    const shownCents = Number((await textOf(page, 'sonder-steuerpflichtig')).replace(/\D/g, ''))
    if (!Number.isFinite(taxableCents) || shownCents !== taxableCents) fail(`Sondertarife: the taxable gain should show the server's ${tariffs.disposal?.taxableGainEur} €, shows „${await textOf(page, 'sonder-steuerpflichtig')}“`)
    console.log(`[${TAG}] ✅ sonder-ergebnis-fehler — the failed result is said; the save shows the server's ${tariffs.disposal.taxableGainEur} €`)

    // --- The session is lost to a guest one: the page offers the sign-in, which comes back to it ------------------------
    // Signing out in this browser outside the app's own button (another tab of the same browser): the session
    // cookie is gone, this tab still shows the area, and its next read reaches the API as a guest.
    const signOutElsewhere = async () => {
      const after = await page.evaluate(async (origin) => {
        const out = await fetch(`${origin}/api/auth/sign-out`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
        const session = await fetch(`${origin}/api/auth/get-session`, { credentials: 'include' })
        return { out: out.status, session: await session.text() }
      }, apiOrigin)
      if (after.out !== 200 || !['', 'null'].includes(after.session.trim())) fail(`precondition: the sign-out elsewhere should end the session, got ${JSON.stringify(after)}`)
    }
    await page.goto(overview, { waitUntil: 'networkidle' })
    await visible(page, 'business-status', 'Account required')
    await signOutElsewhere()
    await page.locator(tid('business-link-voranmeldungen')).click()
    await visible(page, 'business-fehler', 'Account required')
    await expectText(page, 'business-fehler', COPY.loadFailedHeading, 'Account required')
    await page.getByText(COPY.accountRequired).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`Account required: the page should say „${COPY.accountRequired}“`))
    if (await page.locator(tid('fehler-erneut-versuchen')).count()) fail('Account required: a retry cannot help a guest; the page should offer the sign-in instead')
    await expectText(page, 'business-anmelden', COPY.signIn, 'Account required')
    await expectText(page, 'business-konto-anlegen', COPY.createAccount, 'Account required')
    await page.locator(tid('business-anmelden')).click()
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 15_000 }).catch(() => fail(`Account required: „Neu anmelden“ should open the sign-in, the page is at ${page.url()}`))
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await submitLogin(page, user.email, PASSWORD)
    await page
      .waitForURL((u) => u.pathname === `/app/steuerjahr/${YEAR}/selbststaendig/voranmeldungen`, { timeout: 20_000 })
      .catch(() => fail(`Account required: after the sign-in the app should come back to the Voranmeldungen, the page is at ${page.url()}`))
    await visible(page, 'voranmeldungen-seite', 'Account required → signed in again')
    console.log(`[${TAG}] ✅ business-anmelden — a guest read offers the sign-in, which comes back to the Voranmeldungen`)

    // --- …and the account creation ---------------------------------------------------------------------------------------
    await page.locator(tid('business-zurueck')).click()
    await visible(page, 'business-status', 'Account creation')
    await signOutElsewhere()
    await page.locator(tid('business-link-lohn')).click()
    await visible(page, 'business-konto-anlegen', 'Account creation')
    await page.locator(tid('business-konto-anlegen')).click()
    await page.waitForURL((u) => u.pathname === '/registrierung', { timeout: 15_000 }).catch(() => fail(`Account creation: „Konto anlegen“ should open the registration, the page is at ${page.url()}`))
    await page
      .waitForFunction(() => document.title === 'SteuerEule — Konto anlegen', null, { timeout: 10_000 })
      .catch(async () => fail(`Account creation: the registration should be shown, the title is „${await page.title()}“`))
    console.log(`[${TAG}] ✅ business-konto-anlegen — a guest read offers the account creation, which opens the registration`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — the self-employment area's failure, retry and account states reached in the browser.`)
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
