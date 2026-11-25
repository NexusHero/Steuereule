// Partner states gate (ADR-0111 decision 3, PR #581): the couple's coupling, Person B's consent per tax year, and
// the household, children and filing-type masks around it, driven by two real accounts (A invites, B joins) in
// two separate browser contexts on the real stack.
//
//   Row 1  — A's Person B form says what happened: nothing to save, a refused save (the typed name stays), a save.
//   Row 2  — A creates the invitation code from the mask; on an older session the step-up comes first.
//   Row 3  — B joins with the code; on an older session the step-up comes first. Redeeming counts as B's
//            consent for that year: B sees „Du hast zugestimmt“, A sees B's account.
//   Row 4  — B cannot change the Veranlagungsart of A's year: the real 403 is said in the mask.
//   Row 5  — B's printout names that A prints the joint return.
//   Row 6  — A's next year under the link waits for B: the coupling and the link status say when they did not
//            load (retry brings them), and A is told that B has not agreed yet.
//   Row 7  — ending the link fails visibly and changes nothing.
//   Row 8  — B agrees to the year in B's own app, behind the step-up; A then sees B's data.
//   Row 9  — B takes the consent back (confirmation, step-up); A sees nothing of B again.
//   Row 10 — A's printout names the missing consent.
//   Row 11 — the Strom's partner step says when B's details did not load; retry shows them.
//   Row 12 — the Kinder mask: marital status and household load errors with retry, a failed and a real delete,
//            and „Weiter“ with an unsaved child warns once.
//   Row 13 — the filing-type comparison with an unknown marital status, and a typed amount that is no amount.
//   Row 14 — the Günstigerprüfung says when it did not load; retry shows it.
//
// Load and write failures (`*-ladefehler`, `*-fehler`) are produced by answering exactly that one request with a
// 503 in the browser (`page.route`), then removing the route and retrying: the real error path of the app, as in
// e2e/errors/deadlines-and-faults.mjs. Everything else is the real API, the real database and real sessions.
//
// The step-up rule (apps/api/src/auth/step-up-policy.ts) lets a session younger than five minutes, or one with a
// step-up grant younger than five minutes, through. A gate run is younger than that, so the gate moves the clock
// of exactly those two records back in the database (`Session.createdAt`, the grant's `expiresAt`), the state an
// older session reaches by waiting. Nothing in the app is switched for the test.
//
// Tax years: 2024 and 2025 are the years with printed forms (FIELD_SETS); 2023 is a selectable year without a
// coupling, for the masks that do not need one.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { PASSWORD, createAccount, call, answer, browserLogin } from '../harness/api-account.mjs'
import { whereEmail } from '../harness/email-hash.mjs'
import { snapshotPage } from '../harness/failure-snapshot.mjs'

const TAG = 'beta-partner-states'
const JOIN_YEAR = 2024
const CONSENT_YEAR = 2025
const SOLO_YEAR = 2023
const VERIFY_PASSWORD_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const MARRIED_BASIS = [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet'], ['partner-job', 'Nicht berufstätig']]

// Copied from apps/mobile-web/src/i18n/locales/de.json (interpolations filled in where used).
const COPY = {
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  forbidden: 'Das darfst du hier nicht ändern.',
  saveHeading: 'Nicht gespeichert.',
  saveKept: 'Deine Eingabe ist noch da.',
  stepUpHeading: 'Bestätige, dass du es bist',
  personBUnchanged: 'Es gibt nichts Neues zu übernehmen.',
  inviteCreate: 'Einladungscode für deinen Partner erstellen',
  linkLoadError: 'Die Veranlagungsart konnte nicht geladen werden. Solange wählen und übernehmen wir hier nichts.',
  linkStatusLoadError: 'Ob ihr als Paar verknüpft seid, konnte nicht geladen werden.',
  linkedSince: (year) => `Ihr seid seit ${year} verknüpft.`,
  consentQuestion: (year) => `Dein Partner möchte ${year} mit dir zusammen abgeben. Erst wenn du zustimmst, sieht er deine Angaben für ${year} (Steuer-ID, Geburtsdatum, Religion, Beruf).`,
  consentAgree: (year) => `${year} zusammen abgeben – zustimmen`,
  consentWaiting: (year) => `Dein Partner hat ${year} noch nicht zugestimmt. Bis dahin siehst du keine seiner Angaben für ${year}.`,
  consentGiven: (year) => `Du hast zugestimmt, ${year} zusammen abzugeben. Dein Partner sieht deine Angaben für ${year}.`,
  consentWithdraw: (year) => `Zustimmung für ${year} zurücknehmen`,
  personAPrints: 'Euren Ausdruck druckt die Person, die eingeladen hat',
  printoutConsentMissing: (year) => `Dein Partner hat der gemeinsamen Erklärung für ${year} noch nicht zugestimmt.`,
  stromPartnerLoadError: 'Die Angaben zu deinem Partner konnten nicht geladen werden.',
  householdLoadError: 'Die Kinder aus dem Haushalt konnten nicht geladen werden.',
  maritalStatusLoadError: 'Dein Familienstand konnte nicht geladen werden – deshalb fehlen hier die Fragen zum Entlastungsbetrag.',
  childNotDeleted: 'Das Kind wurde nicht gelöscht.',
  childFormOpen: 'Das Kind ist noch nicht gespeichert. Tipp „Kind speichern“ – oder noch einmal „Weiter“, um die Eingaben zu verwerfen.',
  maritalStatusUnknown: 'Ob du verheiratet bist, konnte gerade nicht geladen werden. Wähl es bitte selbst aus.',
  notAnAmount: 'Das ist kein Betrag. Schreib ihn wie „40.000“ oder „40.000,50“.',
  mostFavourableLoadError: 'Die Günstigerprüfung konnte nicht geladen werden.',
  mostFavourableHeading: 'Günstigerprüfung (§ 32d Abs. 6 EStG)',
  depotUnanswered: 'Erst die Depot-Frage im Interview beantworten — dann wissen wir, ob die Günstigerprüfung anwendbar ist.',
}

const tid = (id) => `[data-testid="${id}"]`
const pagesForSnapshot = []

/** Waits for the element and checks that its text contains every expected part. */
async function expectText(page, id, parts, row, timeout = 15_000) {
  const element = page.locator(tid(id))
  await element.waitFor({ state: 'visible', timeout })
  const text = await element.innerText()
  for (const part of [parts].flat()) {
    if (!text.includes(part)) fail(`${row}: ${id} should say „${part}“, it says „${text}“`)
  }
  return element
}

async function gone(page, id, row, timeout = 15_000) {
  await page
    .locator(tid(id))
    .waitFor({ state: 'detached', timeout })
    .catch(() => fail(`${row}: ${id} should be gone`))
}

/** Answers every `method` request to `pattern` with a 503 until `page.unroute(pattern)`; other methods go through. */
async function answer503(page, webOrigin, pattern, method = 'GET') {
  const headers = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
  await page.route(pattern, (route) =>
    route.request().method() === method
      ? route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Service Unavailable' }) })
      : route.continue(),
  )
}

/** The sessions of the account started more than five minutes ago: the step-up rule no longer counts them fresh. */
function ageSessions(sql, email) {
  sql(`UPDATE "Session" SET "createdAt" = now() - interval '10 minutes' WHERE "userId" = (SELECT id FROM "User" WHERE ${whereEmail(email)})`)
}

/** The step-up grants of the account's sessions ran out, as they do five minutes after the password was entered. */
function expireStepUpGrants(sql, email) {
  sql(
    `UPDATE "Verification" SET "expiresAt" = now() - interval '1 minute' WHERE identifier IN ` +
      `(SELECT 'step-up:' || id FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE ${whereEmail(email)}))`,
  )
}

/** The inline step-up as a user meets it: heading, password, confirm; the password check must pass. */
async function confirmStepUp(page, ids, row) {
  await expectText(page, ids.block, COPY.stepUpHeading, row)
  await page.locator(tid(ids.password)).fill(PASSWORD)
  await waitForBucketHeadroom(VERIFY_PASSWORD_BUCKET, 'verify-password', TAG)
  const verified = page.waitForResponse((r) => r.url().endsWith('/api/auth/verify-password') && r.request().method() === 'POST', { timeout: 15_000 })
  await page.locator(tid(ids.confirm)).click()
  const response = await verified
  if (!response.ok()) fail(`${row}: the step-up password check answered ${response.status()}`)
}

async function openPage(browser, webOrigin, email) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  pagesForSnapshot.push(page)
  guardAgainst429(page, fail, '/api/auth/')
  await browserLogin(page, webOrigin, email, TAG)
  return { ctx, page }
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const a = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-a` })
    const b = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-b` })
    await call(a.api, 'PUT', '/v1/profile', { firstName: 'Thomas', lastName: 'Weber' })
    await call(b.api, 'PUT', '/v1/profile', { firstName: 'Sabine', lastName: 'Weber' })
    // B's mask shows the coupling only for a married user.
    await call(b.api, 'PUT', '/v1/stammdaten', { familienstand: 'verheiratet' })
    // „Verheiratet“ in the interview sets up A's joint return with a Person B placeholder and no code (UX review H3).
    await answer(a.api, JOIN_YEAR, MARRIED_BASIS)
    const placeholder = await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)
    if (placeholder.filingType !== 'zusammen' || placeholder.invitationCode !== null || placeholder.personBHasOwnAccount) {
      fail(`setup: the interview should set up a joint return without a code, got ${JSON.stringify(placeholder)}`)
    }
    await answer(a.api, SOLO_YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', '1 Kind']])
    await call(a.api, 'POST', `/v1/steuerjahre/${SOLO_YEAR}/kinder`, { firstName: 'Lina', lastName: 'Weber', geburtsdatum: '2018-03-04' })
    const lina = (await call(a.api, 'GET', `/v1/steuerjahre/${SOLO_YEAR}/kinder`)).kinder.find((k) => k.firstName === 'Lina')
    if (!lina) fail('setup: the child Lina should be stored')

    const { ctx: ctxA, page: pageA } = await openPage(browser, webOrigin, a.email)
    const { ctx: ctxB, page: pageB } = await openPage(browser, webOrigin, b.email)

    // --- Row 1 — A's Person B form ------------------------------------------------------------------------------
    const personBSave = /\/v1\/steuerjahre\/\d+\/kopplung\/person-b$/
    let personBPuts = 0
    pageA.on('request', (r) => {
      if (r.method() === 'PUT' && personBSave.test(new URL(r.url()).pathname)) personBPuts += 1
    })
    await pageA.goto(`${webOrigin}/app/steuerjahr/${JOIN_YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    await pageA.locator(tid('personb-vorname')).waitFor({ state: 'visible', timeout: 15_000 })
    await pageA.locator(tid('personb-speichern')).click()
    await expectText(pageA, 'personb-meldung', COPY.personBUnchanged, 'Row 1 (unchanged)')
    if (personBPuts !== 0) fail('Row 1: an unchanged Person B form must send nothing')
    await answer503(pageA, webOrigin, personBSave, 'PUT')
    await pageA.locator(tid('personb-vorname')).fill('Sabine')
    await pageA.locator(tid('personb-speichern')).click()
    await expectText(pageA, 'personb-meldung', [COPY.saveHeading, COPY.server, COPY.saveKept], 'Row 1 (refused)')
    if ((await pageA.locator(tid('personb-vorname')).inputValue()) !== 'Sabine') fail('Row 1: the typed name must stay after a refused save')
    if ((await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)).personB?.firstName) fail('Row 1: a refused save must store nothing')
    await pageA.unroute(personBSave)
    const saved = pageA.waitForResponse((r) => r.request().method() === 'PUT' && personBSave.test(new URL(r.url()).pathname), { timeout: 15_000 })
    await pageA.locator(tid('personb-speichern')).click()
    if (!(await saved).ok()) fail('Row 1: the Person B save should go through once the endpoint answers')
    const savedB = (await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)).personB
    if (savedB?.firstName !== 'Sabine') fail(`Row 1: Person B's first name should be stored, got ${JSON.stringify(savedB)}`)
    console.log(`[${TAG}] ✅ Row 1 — personb-meldung: unchanged sends nothing, a refused save keeps the name, a save stores it`)

    // --- Row 2 — A creates the invitation code ------------------------------------------------------------------
    ageSessions(sql, a.email)
    const createInvite = await expectText(pageA, 'kopplung-einladung-erstellen', COPY.inviteCreate, 'Row 2')
    await createInvite.click()
    await confirmStepUp(pageA, { block: 'kopplung-einladung-stepup', password: 'kopplung-einladung-stepup-passwort', confirm: 'kopplung-einladung-stepup-bestaetigen' }, 'Row 2')
    const notice = await (await expectText(pageA, 'kopplung-code-anzeige', 'Einladungscode für Partner-Account:', 'Row 2')).innerText()
    const invitationCode = notice.match(/([0-9A-F]{16})/i)?.[1]
    if (!invitationCode) fail(`Row 2: no invitation code in „${notice}“`)
    const withCode = await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)
    if (withCode.invitationCode !== invitationCode) fail(`Row 2: the mask shows ${invitationCode}, the API has ${withCode.invitationCode}`)
    if ((await pageA.locator(tid('kopplung-einladung-erstellen')).count()) !== 0) fail('Row 2: with a code shown, „Einladungscode erstellen“ must be gone')
    console.log(`[${TAG}] ✅ Row 2 — kopplung-einladung-erstellen: after the step-up the mask shows the stored code`)

    // --- Row 3 — B joins with the code --------------------------------------------------------------------------
    ageSessions(sql, b.email)
    await pageB.goto(`${webOrigin}/app/steuerjahr/${JOIN_YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    await pageB.locator(tid('kopplung-code')).waitFor({ state: 'visible', timeout: 15_000 })
    await pageB.locator(tid('kopplung-code')).fill(invitationCode)
    await pageB.locator(tid('kopplung-beitreten')).click()
    await confirmStepUp(pageB, { block: 'kopplung-beitreten-stepup', password: 'kopplung-beitreten-stepup-passwort', confirm: 'kopplung-beitreten-stepup-bestaetigen' }, 'Row 3')
    await expectText(pageB, 'kopplung-zustimmung-gegeben', [COPY.consentGiven(JOIN_YEAR), COPY.consentWithdraw(JOIN_YEAR)], 'Row 3')
    const joined = await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)
    if (!joined.personBHasOwnAccount || joined.personBConsentPending !== false || joined.invitationCode !== null) {
      fail(`Row 3: after B joined, A's year should hold B's account with consent and no code, got ${JSON.stringify(joined)}`)
    }
    console.log(`[${TAG}] ✅ Row 3 — kopplung-beitreten-stepup: B joins after the step-up; redeeming counts as consent (kopplung-zustimmung-gegeben)`)

    // --- Row 4 — B cannot choose the Veranlagungsart of A's year ------------------------------------------------
    await pageB.locator(tid('kopplung-einzel')).click()
    await pageB.locator(tid('rueckfrage-singleAssessment-confirm')).click()
    await expectText(pageB, 'kopplung-art-fehler', COPY.forbidden, 'Row 4')
    const stillJoint = await call(a.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/kopplung`)
    if (stillJoint.filingType !== 'zusammen' || !stillJoint.personBHasOwnAccount) fail(`Row 4: B's refused choice must change nothing, got ${JSON.stringify(stillJoint)}`)
    console.log(`[${TAG}] ✅ Row 4 — kopplung-art-fehler: B's „Einzelveranlagung“ is refused (403) and said; the year stays joint`)

    // --- Row 5 — B's printout: A prints ------------------------------------------------------------------------
    const checkB = await call(b.api, 'GET', `/v1/steuerjahre/${JOIN_YEAR}/ausdruck/pruefung`)
    if (JSON.stringify(checkB.missing) !== JSON.stringify(['personADruckt'])) fail(`Row 5: B's printout check should be ['personADruckt'], got ${JSON.stringify(checkB.missing)}`)
    await pageB.goto(`${webOrigin}/app/steuerjahr/${JOIN_YEAR}/ausdruck`, { waitUntil: 'networkidle' })
    await expectText(pageB, 'ausdruck-person-a-druckt', COPY.personAPrints, 'Row 5')
    console.log(`[${TAG}] ✅ Row 5 — ausdruck-person-a-druckt: B's printout says that A prints the joint return`)

    // --- Row 6 — A's next year waits for B; load errors of the coupling and the link status ---------------------
    // Under the link A's next year names B without a code, and B is asked first (decision 3).
    await answer(a.api, CONSENT_YEAR, MARRIED_BASIS)
    const pending = await call(a.api, 'GET', `/v1/steuerjahre/${CONSENT_YEAR}/kopplung`)
    if (!pending.personBHasOwnAccount || pending.personBConsentPending !== true || pending.personB !== null) {
      fail(`Row 6: ${CONSENT_YEAR} should wait for B's consent and show nothing of B, got ${JSON.stringify(pending)}`)
    }
    const linkRead = new RegExp(`/v1/steuerjahre/${CONSENT_YEAR}/kopplung$`)
    const householdRead = new RegExp(`/v1/steuerjahre/${CONSENT_YEAR}/haushalt$`)
    await answer503(pageA, webOrigin, linkRead)
    await answer503(pageA, webOrigin, householdRead)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${CONSENT_YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'kopplung-ladefehler', [COPY.linkLoadError, COPY.server], 'Row 6 (coupling)')
    if ((await pageA.locator(tid('kopplung-zusammen')).count()) !== 0) fail('Row 6: a coupling that did not load must offer no choice')
    await pageA.unroute(linkRead)
    await pageA.locator(tid('kopplung-ladefehler-erneut')).click()
    await pageA.locator(tid('kopplung-zusammen')).waitFor({ state: 'visible', timeout: 15_000 })
    await gone(pageA, 'kopplung-ladefehler', 'Row 6 (coupling)')
    await expectText(pageA, 'kopplung-status-ladefehler', [COPY.linkStatusLoadError, COPY.server], 'Row 6 (link status)')
    await pageA.unroute(householdRead)
    await pageA.locator(tid('kopplung-status-ladefehler-erneut')).click()
    await expectText(pageA, 'kopplung-verknuepft', COPY.linkedSince(JOIN_YEAR), 'Row 6 (link status)')
    await gone(pageA, 'kopplung-status-ladefehler', 'Row 6 (link status)')
    await expectText(pageA, 'kopplung-zustimmung-ausstehend', COPY.consentWaiting(CONSENT_YEAR), 'Row 6 (consent)')
    console.log(`[${TAG}] ✅ Row 6 — kopplung-ladefehler, kopplung-status-ladefehler with retry; kopplung-zustimmung-ausstehend for ${CONSENT_YEAR}`)

    // --- Row 7 — ending the link fails visibly -----------------------------------------------------------------
    const endLink = new RegExp(`/v1/steuerjahre/${CONSENT_YEAR}/haushalt/partner/nicht-mehr-dabei$`)
    await answer503(pageA, webOrigin, endLink, 'POST')
    await pageA.locator(tid('kopplung-beenden')).click()
    await pageA.locator(tid('rueckfrage-endPartnerLink-confirm')).click()
    await expectText(pageA, 'kopplung-beenden-fehler', [COPY.saveHeading, COPY.server], 'Row 7')
    await pageA.unroute(endLink)
    const linkAfter = (await call(a.api, 'GET', `/v1/steuerjahre/${CONSENT_YEAR}/haushalt`)).partnerLink
    if (!linkAfter || linkAfter.endedFromYear !== null) fail(`Row 7: a failed end must leave the link running, got ${JSON.stringify(linkAfter)}`)
    console.log(`[${TAG}] ✅ Row 7 — kopplung-beenden-fehler: the refused end is said; the link stays`)

    // --- Row 8 — B agrees to the year, behind the step-up ------------------------------------------------------
    // B's grant from Row 3 is still valid; five minutes later it is not, and agreeing asks again.
    expireStepUpGrants(sql, b.email)
    await pageB.goto(`${webOrigin}/app/steuerjahr/${CONSENT_YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    await expectText(pageB, 'kopplung-zustimmung', COPY.consentQuestion(CONSENT_YEAR), 'Row 8')
    const agree = await expectText(pageB, 'kopplung-zustimmen', COPY.consentAgree(CONSENT_YEAR), 'Row 8')
    await agree.click()
    await confirmStepUp(pageB, { block: 'kopplung-zustimmung-stepup', password: 'kopplung-zustimmung-stepup-passwort', confirm: 'kopplung-zustimmung-stepup-bestaetigen' }, 'Row 8')
    await expectText(pageB, 'kopplung-zustimmung-gegeben', COPY.consentGiven(CONSENT_YEAR), 'Row 8')
    const agreed = await call(a.api, 'GET', `/v1/steuerjahre/${CONSENT_YEAR}/kopplung`)
    if (agreed.personBConsentPending !== false || agreed.personB?.firstName !== 'Sabine') fail(`Row 8: after B agreed, A should see B, got ${JSON.stringify(agreed)}`)
    console.log(`[${TAG}] ✅ Row 8 — kopplung-zustimmung, kopplung-zustimmen, kopplung-zustimmung-stepup: B agrees; A sees B's data`)

    // --- Row 9 — B takes the consent back ----------------------------------------------------------------------
    expireStepUpGrants(sql, b.email)
    const withdraw = await expectText(pageB, 'kopplung-zustimmung-zuruecknehmen', COPY.consentWithdraw(CONSENT_YEAR), 'Row 9')
    await withdraw.click()
    await pageB.locator(tid('rueckfrage-partnerConsentWithdraw-confirm')).click()
    await confirmStepUp(pageB, { block: 'kopplung-zustimmung-stepup', password: 'kopplung-zustimmung-stepup-passwort', confirm: 'kopplung-zustimmung-stepup-bestaetigen' }, 'Row 9')
    await expectText(pageB, 'kopplung-zustimmung', COPY.consentQuestion(CONSENT_YEAR), 'Row 9')
    await gone(pageB, 'kopplung-zustimmung-gegeben', 'Row 9')
    const withdrawn = await call(a.api, 'GET', `/v1/steuerjahre/${CONSENT_YEAR}/kopplung`)
    if (withdrawn.personBConsentPending !== true || withdrawn.personB !== null) fail(`Row 9: after the withdrawal A must see nothing of B, got ${JSON.stringify(withdrawn)}`)
    console.log(`[${TAG}] ✅ Row 9 — kopplung-zustimmung-zuruecknehmen: confirmation and step-up; A sees nothing of B again`)

    // --- Row 10 — A's printout names the missing consent -------------------------------------------------------
    const checkA = await call(a.api, 'GET', `/v1/steuerjahre/${CONSENT_YEAR}/ausdruck/pruefung`)
    if (!checkA.missing.includes('personB.zustimmung')) fail(`Row 10: A's printout check should name the missing consent, got ${JSON.stringify(checkA.missing)}`)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${CONSENT_YEAR}/ausdruck`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'ausdruck-zustimmung-person-b', COPY.printoutConsentMissing(CONSENT_YEAR), 'Row 10')
    console.log(`[${TAG}] ✅ Row 10 — ausdruck-zustimmung-person-b: A's printout names B's missing consent`)

    // --- Row 11 — the Strom's partner step ---------------------------------------------------------------------
    const joinLinkRead = new RegExp(`/v1/steuerjahre/${JOIN_YEAR}/kopplung$`)
    await answer503(pageA, webOrigin, joinLinkRead)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${JOIN_YEAR}/strom/partner`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'strom-partner-ladefehler', [COPY.stromPartnerLoadError, COPY.server], 'Row 11')
    if ((await pageA.locator(tid('strom-partner-vorname')).count()) !== 0) fail('Row 11: without B\'s details the page must not offer empty fields')
    await pageA.unroute(joinLinkRead)
    await pageA.locator(tid('strom-partner-ladefehler-erneut')).click()
    await pageA.locator(tid('strom-partner-vorname')).waitFor({ state: 'visible', timeout: 15_000 })
    if ((await pageA.locator(tid('strom-partner-vorname')).inputValue()) !== 'Sabine') fail('Row 11: after the retry the field should hold B\'s stored first name')
    console.log(`[${TAG}] ✅ Row 11 — strom-partner-ladefehler: retry shows B's stored name`)

    // --- Row 12 — the Kinder mask ------------------------------------------------------------------------------
    const masterDataRead = /\/v1\/stammdaten$/
    const soloHouseholdRead = new RegExp(`/v1/steuerjahre/${SOLO_YEAR}/haushalt$`)
    await answer503(pageA, webOrigin, masterDataRead)
    await answer503(pageA, webOrigin, soloHouseholdRead)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${SOLO_YEAR}/kinder`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'kinder-familienstand-ladefehler', [COPY.maritalStatusLoadError, COPY.server], 'Row 12 (marital status)')
    await expectText(pageA, 'haushalt-ladefehler', [COPY.householdLoadError, COPY.server], 'Row 12 (household)')
    await pageA.unroute(masterDataRead)
    await pageA.locator(tid('kinder-familienstand-ladefehler-erneut')).click()
    await gone(pageA, 'kinder-familienstand-ladefehler', 'Row 12 (marital status)')
    await pageA.unroute(soloHouseholdRead)
    await pageA.locator(tid('haushalt-ladefehler-erneut')).click()
    await pageA.locator(tid('haushalt-kinder')).waitFor({ state: 'visible', timeout: 15_000 })
    await gone(pageA, 'haushalt-ladefehler', 'Row 12 (household)')
    console.log(`[${TAG}] ✅ Row 12 — kinder-familienstand-ladefehler, haushalt-ladefehler: retry brings the marital status and the household`)

    const deleteChild = new RegExp(`/v1/steuerjahre/${SOLO_YEAR}/kinder/${lina.id}$`)
    const deleteButton = pageA.locator(tid(`kind-loeschen-${lina.id}`))
    await answer503(pageA, webOrigin, deleteChild, 'DELETE')
    await deleteButton.click()
    await pageA.locator(tid('rueckfrage-childDelete-confirm')).click()
    await expectText(pageA, 'kind-loeschen-fehler', [COPY.childNotDeleted, COPY.server], 'Row 12 (delete refused)')
    if (!(await deleteButton.isVisible())) fail('Row 12: a refused delete must leave the child in the list')
    if (!(await call(a.api, 'GET', `/v1/steuerjahre/${SOLO_YEAR}/kinder`)).kinder.some((k) => k.id === lina.id)) fail('Row 12: a refused delete must keep the child stored')
    await pageA.unroute(deleteChild)
    await deleteButton.click()
    await pageA.locator(tid('rueckfrage-childDelete-confirm')).click()
    await gone(pageA, `kind-loeschen-${lina.id}`, 'Row 12 (delete)')
    await gone(pageA, 'kind-loeschen-fehler', 'Row 12 (delete)')
    if ((await call(a.api, 'GET', `/v1/steuerjahre/${SOLO_YEAR}/kinder`)).kinder.some((k) => k.id === lina.id)) fail('Row 12: the deleted child must be gone from the API')
    console.log(`[${TAG}] ✅ Row 12 — kind-loeschen-<id>, kind-loeschen-fehler: a refused delete is said and keeps the child; the retry deletes it`)

    await pageA.locator(tid('kind-neu')).click()
    await pageA.locator(tid('kind-vorname')).fill('Paul')
    await pageA.locator(tid('kinder-weiter')).click()
    await expectText(pageA, 'kinder-formular-offen', COPY.childFormOpen, 'Row 12 (unsaved child)')
    if (!new URL(pageA.url()).pathname.endsWith(`/steuerjahr/${SOLO_YEAR}/kinder`)) fail(`Row 12: the first „Weiter“ must stay on the mask, now at ${pageA.url()}`)
    await pageA.locator(tid('kinder-weiter')).click()
    await pageA.waitForURL((u) => !u.pathname.endsWith('/kinder'), { timeout: 15_000 })
    if ((await call(a.api, 'GET', `/v1/steuerjahre/${SOLO_YEAR}/kinder`)).kinder.some((k) => k.firstName === 'Paul')) fail('Row 12: the discarded child must not be stored')
    console.log(`[${TAG}] ✅ Row 12 — kinder-formular-offen: „Weiter“ with an unsaved child warns once, the second discards it`)

    // --- Row 13 — the filing-type comparison -------------------------------------------------------------------
    let comparisons = 0
    pageA.on('request', (r) => {
      if (r.url().includes(`/v1/steuerjahre/${SOLO_YEAR}/veranlagungsartenvergleich`)) comparisons += 1
    })
    await answer503(pageA, webOrigin, masterDataRead)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${SOLO_YEAR}/veranlagungsvergleich`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'vergleich-familienstand-unbekannt', COPY.maritalStatusUnknown, 'Row 13 (unknown)')
    if ((await pageA.locator(tid('zveb-input')).count()) !== 0) fail('Row 13: with the marital status unknown nothing may be preselected')
    await pageA.unroute(masterDataRead)
    await pageA.locator(tid('verheiratet-ja')).click()
    await gone(pageA, 'vergleich-familienstand-unbekannt', 'Row 13 (unknown)')
    await pageA.locator(tid('zveb-input')).fill('vierzig')
    await expectText(pageA, 'zveb-ungueltig', COPY.notAnAmount, 'Row 13 (no amount)')
    if (comparisons !== 0) fail('Row 13: an input that is no amount must not be compared')
    const compared = pageA.waitForResponse((r) => r.url().includes(`/v1/steuerjahre/${SOLO_YEAR}/veranlagungsartenvergleich`) && r.url().includes('zveB=40000'), { timeout: 15_000 })
    await pageA.locator(tid('zveb-input')).fill('40.000')
    if (!(await compared).ok()) fail('Row 13: „40.000“ should be compared')
    await gone(pageA, 'zveb-ungueltig', 'Row 13 (amount)')
    console.log(`[${TAG}] ✅ Row 13 — vergleich-familienstand-unbekannt, zveb-ungueltig: unknown status asks, no amount is said, „40.000“ is compared`)

    // --- Row 14 — the Günstigerprüfung -------------------------------------------------------------------------
    const mostFavourableRead = new RegExp(`/v1/steuerjahre/${SOLO_YEAR}/kapital/guenstigerpruefung(\\?.*)?$`)
    await answer503(pageA, webOrigin, mostFavourableRead)
    await pageA.goto(`${webOrigin}/app/steuerjahr/${SOLO_YEAR}/kapital`, { waitUntil: 'networkidle' })
    await expectText(pageA, 'guenstigerpruefung-ladefehler', [COPY.mostFavourableLoadError, COPY.server], 'Row 14')
    await pageA.unroute(mostFavourableRead)
    await pageA.locator(tid('guenstigerpruefung-ladefehler-erneut')).click()
    await pageA.getByText(COPY.mostFavourableHeading, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    await pageA.getByText(COPY.depotUnanswered, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    await gone(pageA, 'guenstigerpruefung-ladefehler', 'Row 14')
    console.log(`[${TAG}] ✅ Row 14 — guenstigerpruefung-ladefehler: retry shows the Günstigerprüfung`)

    await ctxA.close()
    await ctxB.close()
    await a.api.dispose()
    await b.api.dispose()
    console.log(`[${TAG}] PASS — coupling, per-year consent with step-up, household, children and comparison states verified.`)
  } catch (error) {
    // Before the browser closes: what each page showed when the step failed (log and artifact).
    for (const [index, page] of pagesForSnapshot.entries()) await snapshotPage(page, TAG, index === 0 ? 'person-a' : 'person-b')
    throw error
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
