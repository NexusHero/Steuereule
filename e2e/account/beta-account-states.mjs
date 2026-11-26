// Account states of the beta (#581): the notices, failure states and step-ups around an account that
// `account-security.mjs` does not reach. Every row brings the real app into the state through the real API and
// database and asserts what the user sees and what the server holds afterwards.
//   Row A — a guest: the profile says an account is needed; the registration shows the beta notice and the legal
//           line (its AGB link opens the AGB); after the sign-up the account wall asks to confirm the address
//           and leads to the sign-in.
//   Row B — the mail links: an expired verification link, the link of a deleted account (offers a new
//           registration), the valid link (address confirmed, then signed in, the pending note is cleared), and
//           a provider sign-in the user cancels at Google (the sign-in says it failed).
//   Row C — an account whose address is not confirmed (an account from before ADR-0109 §11, whose session
//           outlived the rule) sees the deletion warning on every screen; its link opens the export.
//   Row D — Sicherheit: the session check and the passkey list fail and come back on retry; a passkey is added
//           on a fresh session; on an older session removing it asks for the step-up, which is cancelled once
//           and then confirmed with the passkey itself.
//   Row E — OAuth consent: the client lookup fails (approving stays off) and comes back on retry; a request
//           without rights says so; a consent page without a client cannot be approved; an approved assistant
//           shows its rights and where its access goes in the profile.
//   Row F — the profile lists (assistants, devices), the owl's consent and the stored documents in the chat
//           fail to load and come back on retry; the chat names who receives a message before the first one.
//   Row G — an older session approving another device is asked for the password first, then the device is in.
//   Row H — the password is changed in Sicherheit; when the session is ended elsewhere the app opens the sign-in
//           with the expiry notice; signing out from the profile ends the session.
//
// HOW THE MAIL LINKS ARE BUILT. This stack's mail sender only logs. A verification link is the HS256 token
// better-auth signs with BETTER_AUTH_SECRET (`createEmailVerificationToken`: `{ email }`, `iat`, `exp`), behind
// `/api/auth/verify-email` with the callback `redirectVerificationToWebApp` sets. The gate signs the same token
// with the job's secret, so the API's own verification route, its removed-account hook (ADR-0030 §5) and its
// redirects are what run; only the mailbox is left out (as the reset token in `account-security.mjs` Row F).
// HOW THE STEP-UP IS REACHED. An action under the step-up rule needs a session younger than five minutes
// (`step-up-policy.ts`). Waiting five minutes is no condition, so the gate dates the session's `createdAt`
// back ten minutes in the database, which is the row an older session has; the server then decides as for any
// older session. Passkeys come from a Chromium virtual authenticator (CDP WebAuthn), a real WebAuthn ceremony.
// HOW GOOGLE IS ANSWERED. Google itself cannot be reached from CI; the browser's request to accounts.google.com
// is answered with the redirect Google sends when the user cancels (`error=access_denied` with the state), so
// the API's real callback decides where the browser lands.
// Load failures follow `errors/deadlines-and-faults.mjs`: one read answers 503 through `page.route`, the error
// state and its wording are asserted, the route is removed and the retry must show the real data.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429, authoredText } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, submitLogin } from '../harness/flows.mjs'
import { whereEmail, verifyEmailSql } from '../harness/email-hash.mjs'
import { createAccount, call, PASSWORD } from '../harness/api-account.mjs'
import { withPageSnapshot } from '../harness/failure-snapshot.mjs'
import { TINY_PNG } from '../fixtures/synthetic-documents.mjs'

const TAG = 'beta-account-states'
const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const DEVICE_BUCKET = { windowMs: 60_000, max: 10 }
const NEW_PASSWORD = 'Ganz-Neues-Passwort-7!'
const REDIRECT_URI = 'http://127.0.0.1:9/callback'
// The API's fallback outside production (apps/api/src/auth/better-auth-env.ts), for a stack booted locally.
const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-better-auth-secret-do-not-use-in-production'

// German copy, exactly as apps/mobile-web/src/i18n/locales/de.json has it.
const COPY = {
  accountRequired: 'Dafür brauchst du ein kostenloses Konto. Als Gast geht das nicht.',
  betaLabel: 'Beta:',
  betaNotice: 'SteuerEule ist in der Testphase.',
  legalTerms: 'Mit dem Anlegen akzeptierst du die AGB',
  legalPrivacy: 'Datenschutzerklärung',
  registrationSent: 'Schau in dein Postfach.',
  wallVerifyHeading: 'Bestätige deine E-Mail',
  verifiedHeading: 'E-Mail bestätigt ✓',
  linkExpiredHeading: 'Dieser Bestätigungslink gilt nicht mehr.',
  removedHeading: 'Dieses Konto gibt es nicht mehr.',
  removedRegister: 'Neu registrieren',
  socialFailed: 'Die Anmeldung beim Anbieter hat nicht geklappt oder wurde abgebrochen.',
  google: 'Weiter mit Google',
  unverifiedHeading: 'Bitte bestätige deine E-Mail-Adresse.',
  unverifiedDeletion: 'löschen wir: deines frühestens am',
  unverifiedExport: 'Vorher deine Daten exportieren',
  server: 'Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.',
  retry: 'Noch mal versuchen',
  sessionUnknown: 'Wir konnten gerade nicht prüfen, ob du angemeldet bist. Versuch es gleich noch mal.',
  passkeyError: 'Das hat nicht geklappt. Versuch es noch einmal.',
  passkeyEmpty: 'Noch keine Passkeys eingerichtet.',
  passkeyAdd: 'Passkey hinzufügen',
  passkeyAdded: 'Passkey wurde hinzugefügt.',
  passkeyRemove: 'Entfernen',
  passkeyRemoved: 'Passkey wurde entfernt.',
  passkeyStepUpTitle: 'Passwort bestätigen',
  withPasskey: 'Mit Passkey bestätigen',
  lookupFailed: 'Wir konnten nicht prüfen, welcher Assistent das ist. Erlauben geht erst, wenn das klappt.',
  clientLookupFailed: 'Wer diesen Zugriff anfragt, ließ sich nicht prüfen.',
  scopeNone: 'keine Rechte angefragt',
  destinationDevice: 'eine App auf diesem Gerät',
  scopeRead: 'Steuerdaten lesen (maskiert)',
  devicesLoadError: 'Deine Geräte konnten nicht geladen werden',
  owlNotGranted: 'Nicht erlaubt',
  owlAllow: 'Erlauben',
  owlGrantedPrefix: 'Erlaubt seit',
  privacyNotice: 'Was du hier schreibst, geht an ein Sprachmodell von',
  stepUpHeading: 'Bestätige, dass du es bist',
  deviceApproved: 'Erledigt',
  passwordMismatch: 'Die beiden neuen Passwörter stimmen nicht überein.',
  passwordChanged: 'Passwort geändert ✓ Andere Geräte und Assistenten sind abgemeldet.',
  sessionExpired: 'Deine Anmeldung ist abgelaufen. Melde dich neu an, dann bringen wir dich zurück, wo du warst.',
}

const byId = (page, id) => page.locator(`[data-testid="${id}"]`)
const cors = (webOrigin) => ({ 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' })

/** A route handler that answers GET with a 503 and lets every other method through. */
const failReads = (webOrigin) => (route) =>
  route.request().method() === 'GET'
    ? route.fulfill({ status: 503, headers: cors(webOrigin), contentType: 'application/json', body: JSON.stringify({ message: 'Service Unavailable' }) })
    : route.continue()

/** Waits for `id` and checks that its text contains `expected`. */
async function seeText(page, id, expected, row) {
  const el = byId(page, id)
  await el.waitFor({ state: 'visible', timeout: 20_000 })
  const text = await authoredText(el)
  if (!text.includes(expected)) fail(`${row}: [${id}] must say „${expected}“, got „${text}“`)
  return text
}

async function expectDisabled(page, id, disabled, row) {
  const locator = byId(page, id)
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  if ((await locator.isDisabled()) !== disabled) fail(`${row}: [${id}] must be ${disabled ? 'disabled' : 'enabled'}`)
}

/** Waits until the button `id` is enabled (the condition, not a time). */
async function waitEnabled(page, id) {
  await page.waitForFunction(
    (selector) => {
      const el = document.querySelector(selector)
      return el !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
    },
    `[data-testid="${id}"]`,
    { timeout: 20_000 },
  )
}

/** The verification token better-auth signs (`createEmailVerificationToken`), valid for `lifetimeSeconds` from `issuedAt`. */
function verificationToken(email, { issuedAt = Math.floor(Date.now() / 1000), lifetimeSeconds = 3600 } = {}) {
  const secret = process.env.BETTER_AUTH_SECRET || DEV_ONLY_FALLBACK_SECRET
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const head = part({ alg: 'HS256' })
  const body = part({ email: email.toLowerCase(), iat: issuedAt, exp: issuedAt + lifetimeSeconds })
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

/** The link the verification mail carries (`/verify-email` with the callback `redirectVerificationToWebApp` sets). */
function verificationLink(apiOrigin, webOrigin, token) {
  return `${apiOrigin}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(`${webOrigin}/login?bestaetigt=1`)}`
}

const userIdOf = (sql, email) => sql(`SELECT id FROM "User" WHERE ${whereEmail(email)}`)
const emailVerifiedOf = (sql, email) => sql(`SELECT "emailVerified" FROM "User" WHERE ${whereEmail(email)}`)
/** Dates every session of the account back past the step-up window, as an older session is. */
const ageSessions = (sql, email) => sql(`UPDATE "Session" SET "createdAt" = now() - interval '10 minutes' WHERE "userId" = (SELECT id FROM "User" WHERE ${whereEmail(email)})`)

async function apiSignIn(apiOrigin, webOrigin, email, password) {
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password } })
  return { api, res }
}

async function browserSignIn(page, webOrigin, email, password) {
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, password)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 20_000 })
}

// Row A + B + C — one guest browser that registers, follows the links and signs in.
async function guestAndMailLinks(browser, { apiOrigin, webOrigin, sql }) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await withPageSnapshot(page, `${TAG}-guest`, async () => {
    // Row A — a guest's profile has no account lists, only the note that an account is needed.
    await skipSplash(page, webOrigin)
    await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
    await seeText(page, 'profil-konto-noetig', COPY.accountRequired, 'Row A')
    if ((await byId(page, 'profil-abmelden').count()) !== 0) fail('Row A: a guest has nothing to sign out of')
    await seeText(page, 'beta-hinweis', COPY.betaNotice, 'Row A (profile)')

    // The registration: the beta notice, the legal line and its AGB link.
    await page.goto(`${webOrigin}/registrierung`, { waitUntil: 'networkidle' })
    const beta = await seeText(page, 'beta-hinweis', COPY.betaLabel, 'Row A (registration)')
    if (!beta.includes(COPY.betaNotice)) fail(`Row A: the beta notice must say „${COPY.betaNotice}“, got „${beta}“`)
    const legal = await seeText(page, 'registrierung-rechtliches', COPY.legalTerms, 'Row A')
    if (!legal.includes(COPY.legalPrivacy)) fail(`Row A: the legal line must name the „${COPY.legalPrivacy}“, got „${legal}“`)
    await byId(page, 'registrierung-rechtliches').locator('[data-testid="rechtliches-link-agb"]').click()
    await page.waitForURL((u) => u.pathname === '/rechtliches/agb', { timeout: 10_000 })

    const email = `beta-states-guest-${Date.now()}@beispiel.de`
    await page.goto(`${webOrigin}/registrierung`, { waitUntil: 'networkidle' })
    await byId(page, 'registrierung-email').fill(email)
    await byId(page, 'registrierung-passwort').fill(PASSWORD)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await byId(page, 'registrierung-submit').click()
    await page.getByText(COPY.registrationSent, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    if (emailVerifiedOf(sql, email) !== 'f') fail('Row A: the sign-up must leave an account that is not confirmed yet')

    // The account wall knows the pending registration and leads to the sign-in, not to a second registration.
    await page.goto(`${webOrigin}/app/konto-wand`, { waitUntil: 'networkidle' })
    const card = await seeText(page, 'konto-wand-bestaetigen', COPY.wallVerifyHeading, 'Row A')
    if (!card.includes(email)) fail(`Row A: the account wall must name the address the link went to, got „${card}“`)
    await byId(page, 'konto-wand-bestaetigt-anmelden').click()
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 10_000 })
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Row A — guest profile needs an account; beta notice and legal line; the wall leads a pending registration to the sign-in`)

    // Row B — a provider sign-in the user cancels at Google.
    await ctx.route('https://accounts.google.com/**', (route) => {
      const asked = new URL(route.request().url())
      const back = new URL(asked.searchParams.get('redirect_uri') ?? '')
      back.searchParams.set('state', asked.searchParams.get('state') ?? '')
      back.searchParams.set('error', 'access_denied')
      return route.fulfill({ status: 302, headers: { location: back.toString() } })
    })
    const googleButton = page.getByRole('button', { name: COPY.google })
    await googleButton.waitFor({ state: 'visible', timeout: 10_000 })
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/social', TAG)
    await googleButton.click()
    await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('sozial') === '1', { timeout: 20_000 })
    if (!new URL(page.url()).searchParams.get('error')) fail(`Row B: the cancelled provider sign-in must land with an error, got ${page.url()}`)
    await seeText(page, 'sozial-anmeldung-fehlgeschlagen', COPY.socialFailed, 'Row B')
    await ctx.unroute('https://accounts.google.com/**')
    const afterSocial = await ctx.request.get(`${apiOrigin}/api/auth/get-session`, { headers: { origin: webOrigin } })
    if ((await afterSocial.json().catch(() => null))?.session) fail('Row B: a cancelled provider sign-in must not sign in')
    console.log(`[${TAG}] ✅ Row B — a provider sign-in cancelled at Google lands on the sign-in with its notice, no session`)

    // Row B — an expired link: the address stays unconfirmed and the sign-in says the link is gone.
    const issuedLongAgo = Math.floor(Date.now() / 1000) - 7200
    await page.goto(verificationLink(apiOrigin, webOrigin, verificationToken(email, { issuedAt: issuedLongAgo, lifetimeSeconds: 3600 })), { waitUntil: 'networkidle' })
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 15_000 })
    if (new URL(page.url()).searchParams.get('error') !== 'TOKEN_EXPIRED') fail(`Row B: an expired link must land with error=TOKEN_EXPIRED, got ${page.url()}`)
    await seeText(page, 'email-link-abgelaufen', COPY.linkExpiredHeading, 'Row B')
    if ((await byId(page, 'email-bestaetigt').count()) !== 0) fail('Row B: an expired link must not say the address is confirmed')
    if (emailVerifiedOf(sql, email) !== 'f') fail('Row B: an expired link must not confirm the address')

    // Row B — the link of an account its owner deleted: the sign-in says so and offers a new registration.
    const removed = await createAccount({ apiOrigin, webOrigin, sql, tag: 'beta-states-removed' })
    const deletion = await removed.api.fetch('/v1/account', { method: 'DELETE', data: { confirm: true, password: PASSWORD } })
    if (!deletion.ok()) fail(`Row B: deleting the account answered ${deletion.status()}: ${(await deletion.text()).slice(0, 200)}`)
    await removed.api.dispose()
    if (userIdOf(sql, removed.email) !== '') fail('Row B: the deleted account must be gone')
    await page.goto(verificationLink(apiOrigin, webOrigin, verificationToken(removed.email)), { waitUntil: 'networkidle' })
    await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('error') === 'ACCOUNT_REMOVED', { timeout: 15_000 })
    await seeText(page, 'konto-entfernt', COPY.removedHeading, 'Row B')
    if ((await byId(page, 'email-link-abgelaufen').count()) !== 0) fail('Row B: a removed account must not be told its link expired')
    await seeText(page, 'konto-entfernt-registrieren', COPY.removedRegister, 'Row B')
    await byId(page, 'konto-entfernt-registrieren').click()
    await page.waitForURL((u) => u.pathname === '/registrierung', { timeout: 10_000 })
    await byId(page, 'registrierung-email').waitFor({ state: 'visible', timeout: 10_000 })

    // Row B — the valid link confirms the address and does not sign in; the sign-in then clears the pending note.
    await page.goto(verificationLink(apiOrigin, webOrigin, verificationToken(email)), { waitUntil: 'networkidle' })
    await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('bestaetigt') === '1', { timeout: 15_000 })
    await seeText(page, 'email-bestaetigt', COPY.verifiedHeading, 'Row B')
    if ((await byId(page, 'email-link-abgelaufen').count()) !== 0) fail('Row B: a valid link must not say it expired')
    if (emailVerifiedOf(sql, email) !== 't') fail('Row B: the valid link must confirm the address')
    const beforeSignIn = await ctx.request.get(`${apiOrigin}/api/auth/get-session`, { headers: { origin: webOrigin } })
    if ((await beforeSignIn.json().catch(() => null))?.session) fail('Row B: the verification link must not sign in (ADR-0109 §11)')
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await submitLogin(page, email, PASSWORD)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 20_000 })
    const pending = await page.evaluate(() => window.localStorage.getItem('steuereule.pendingVerification'))
    if (pending !== null) fail(`Row B: the sign-in must clear the pending registration note, found ${pending}`)
    console.log(`[${TAG}] ✅ Row B — expired link, removed account (new registration offered) and valid link (confirmed, no sign-in) each say so`)

    // Row C — the address is not confirmed for a signed-in account: every screen warns and offers the export.
    sql(`UPDATE "User" SET "emailVerified" = false WHERE ${whereEmail(email)}`)
    await page.reload({ waitUntil: 'networkidle' })
    const warning = await seeText(page, 'konto-unbestaetigt', COPY.unverifiedHeading, 'Row C')
    if (!warning.includes(email) || !warning.includes(COPY.unverifiedDeletion)) fail(`Row C: the warning must name the address and the deletion floor, got „${warning}“`)
    await byId(page, 'konto-unbestaetigt').getByText(COPY.unverifiedExport, { exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/app/profil/datenschutz', { timeout: 10_000 })
    sql(verifyEmailSql(email))
    const sessionRead = page.waitForResponse((r) => r.url().includes('/api/auth/get-session') && r.ok(), { timeout: 15_000 })
    await page.reload({ waitUntil: 'networkidle' })
    if ((await (await sessionRead).json().catch(() => null))?.user?.emailVerified !== true) fail('Row C: the session must report the confirmed address after the reload')
    await byId(page, 'konto-loeschen-oeffnen').waitFor({ state: 'visible', timeout: 15_000 })
    if ((await byId(page, 'konto-unbestaetigt').count()) !== 0) fail('Row C: a confirmed account must not see the deletion warning')
    console.log(`[${TAG}] ✅ Row C — an unconfirmed account sees the deletion warning with its address and date; it opens the export and goes once confirmed`)
  })
  await ctx.close()
}

// Row D–H — one account through Sicherheit, OAuth, the profile lists, the owl, a device and the password.
async function signedInAccount(browser, { apiOrigin, webOrigin, sql }) {
  const user = await createAccount({ apiOrigin, webOrigin, sql, tag: 'beta-states-account' })
  const { email, api } = user
  const userId = userIdOf(sql, email)
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  guardAgainst429(page, fail, '/v1/device/')
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })

  await withPageSnapshot(page, `${TAG}-account`, async () => {
    await browserSignIn(page, webOrigin, email, PASSWORD)

    // Row D — the session check fails: Sicherheit says it could not check, not „only for an account“.
    const getSession = /\/api\/auth\/get-session(\?.*)?$/
    const passkeyList = /\/api\/auth\/passkey\/list-user-passkeys(\?.*)?$/
    await page.route(getSession, failReads(webOrigin))
    await page.route(passkeyList, failReads(webOrigin))
    await page.goto(`${webOrigin}/app/profil/sicherheit`, { waitUntil: 'networkidle' })
    await seeText(page, 'sicherheit-sitzung-unbekannt', COPY.sessionUnknown, 'Row D')
    await seeText(page, 'sicherheit-sitzung-erneut', COPY.retry, 'Row D')
    await page.unroute(getSession)
    await byId(page, 'sicherheit-sitzung-erneut').click()
    await byId(page, 'zweifaktor-einrichten').waitFor({ state: 'visible', timeout: 20_000 })
    if ((await byId(page, 'sicherheit-sitzung-unbekannt').count()) !== 0) fail('Row D: after the retry the session must be known')
    // The passkey list fails while the screen loads it: no „Wird geladen …“ for ever, a retry instead.
    await seeText(page, 'passkey-liste-erneut', COPY.retry, 'Row D')
    await page.getByText(COPY.passkeyError, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.unroute(passkeyList)
    await byId(page, 'passkey-liste-erneut').click()
    await page.getByText(COPY.passkeyEmpty, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    if ((await byId(page, 'passkey-liste-erneut').count()) !== 0) fail('Row D: the retry must go once the list loaded')
    console.log(`[${TAG}] ✅ Row D — a failed session check and a failed passkey list say so and come back on retry`)

    // Row D — a passkey on the fresh session.
    await page.getByRole('button', { name: COPY.passkeyAdd }).click()
    await page.getByText(COPY.passkeyAdded, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    if (sql(`SELECT count(*) FROM "Passkey" WHERE "userId" = '${userId}'`) !== '1') fail('Row D: the added passkey must be stored')
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    if (credentials.length !== 1 || credentials[0].isResidentCredential !== true) fail(`Row D: the authenticator must hold one discoverable passkey, got ${JSON.stringify(credentials.map((c) => c.isResidentCredential))}`)

    // On an older session removing it asks for the step-up: password or the passkey; cancelling leaves it.
    ageSessions(sql, email)
    await page.getByRole('button', { name: COPY.passkeyRemove, exact: true }).click()
    await page.getByText(COPY.passkeyStepUpTitle, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await byId(page, 'passkey-passwort').waitFor({ state: 'visible', timeout: 10_000 })
    await seeText(page, 'passkey-stepup-ohne-passwort-passkey', COPY.withPasskey, 'Row D')
    await byId(page, 'passkey-passwort-abbrechen').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="passkey-passwort"]') === null, undefined, { timeout: 10_000 })
    if (sql(`SELECT count(*) FROM "Passkey" WHERE "userId" = '${userId}'`) !== '1') fail('Row D: cancelling the step-up must leave the passkey')
    const sessionsBefore = Number(sql(`SELECT count(*) FROM "Session" WHERE "userId" = '${userId}'`))
    await page.getByRole('button', { name: COPY.passkeyRemove, exact: true }).click()
    await byId(page, 'passkey-stepup-ohne-passwort-passkey').click()
    await page.getByText(COPY.passkeyRemoved, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByText(COPY.passkeyEmpty, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    if (sql(`SELECT count(*) FROM "Passkey" WHERE "userId" = '${userId}'`) !== '0') fail('Row D: the confirmed removal must delete the passkey')
    if (Number(sql(`SELECT count(*) FROM "Session" WHERE "userId" = '${userId}'`)) !== sessionsBefore + 1) fail('Row D: confirming with the passkey must be a new sign-in (a fresh session)')
    console.log(`[${TAG}] ✅ Row D — passkey added; on an older session its removal asks first, cancel keeps it, the passkey itself confirms and it is gone`)

    // Row E — OAuth consent. The client registers itself before anyone approves it (ADR-0052 amendment 5).
    const registration = { application_type: 'native', client_name: 'E2E-Zustandsassistent', redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }
    const reg = await fetch(`${apiOrigin}/api/auth/oauth2/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(registration) })
    if (!reg.ok) fail(`Row E: client registration answered ${reg.status}: ${(await reg.text()).slice(0, 200)}`)
    const client = await reg.json()
    await page.route('http://127.0.0.1:9/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
    const authorize = async (scope) => {
      const verifier = randomBytes(32).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      const params = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT_URI, scope, state: 'e2e', code_challenge: challenge, code_challenge_method: 'S256' })
      await page.goto(`${apiOrigin}/api/auth/oauth2/authorize?${params}`, { waitUntil: 'networkidle' })
      await page.waitForURL((u) => u.pathname === '/oauth/consent', { timeout: 15_000 })
      return verifier
    }
    const clientInfo = /\/v1\/oauth\/client-info(\?.*)?$/
    await page.route(clientInfo, failReads(webOrigin))
    await authorize('openid')
    await byId(page, 'oauth-lookup-fehler').waitFor({ state: 'visible', timeout: 20_000 })
    await seeText(page, 'oauth-client-unbekannt', COPY.lookupFailed, 'Row E')
    await expectDisabled(page, 'oauth-erlauben', true, 'Row E (lookup failed)')
    await seeText(page, 'oauth-keine-rechte', COPY.scopeNone, 'Row E')
    await page.unroute(clientInfo)
    // A failed lookup names no destination (it is not known); the retry's answer does.
    if ((await byId(page, 'oauth-destination').count()) !== 0) fail('Row E: a failed client lookup must not name a destination')
    await byId(page, 'oauth-lookup-erneut').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="oauth-lookup-fehler"]') === null, undefined, { timeout: 10_000 })
    await seeText(page, 'oauth-destination', COPY.destinationDevice, 'Row E')
    await waitEnabled(page, 'oauth-erlauben')
    const denied = page.waitForRequest((r) => r.url().startsWith(REDIRECT_URI), { timeout: 15_000 })
    await byId(page, 'oauth-ablehnen').click()
    if (new URL((await denied).url()).searchParams.get('error') !== 'access_denied') fail('Row E: „Ablehnen“ must redirect with error=access_denied')

    // A consent page that names no client cannot be approved.
    await page.goto(`${webOrigin}/oauth/consent?scope=openid`, { waitUntil: 'networkidle' })
    await seeText(page, 'oauth-client-unbekannt', COPY.clientLookupFailed, 'Row E')
    await expectDisabled(page, 'oauth-erlauben', true, 'Row E (no client)')

    // An approved assistant: its rights and where its access goes show in the profile.
    const verifier = await authorize('openid steuerdaten:read')
    await seeText(page, 'oauth-destination', COPY.destinationDevice, 'Row E')
    if ((await byId(page, 'oauth-keine-rechte').count()) !== 0) fail('Row E: a request for rights must not say it asks for none')
    const approved = page.waitForRequest((r) => r.url().startsWith(REDIRECT_URI), { timeout: 15_000 })
    await byId(page, 'oauth-erlauben').click()
    const code = new URL((await approved).url()).searchParams.get('code')
    if (!code) fail('Row E: „Erlauben“ must redirect with a code')
    const tokenRes = await fetch(`${apiOrigin}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: client.client_id, code_verifier: verifier }),
    })
    if (!tokenRes.ok) fail(`Row E: token exchange answered ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`)
    await page.unroute('http://127.0.0.1:9/**')
    console.log(`[${TAG}] ✅ Row E — failed client lookup keeps „Erlauben“ off until the retry; no rights and no client are said; the approval issues a code`)

    // Row F — the profile lists fail to load and come back; the approved assistant shows rights and destination.
    const assistants = /\/v1\/assistenten(\?.*)?$/
    const sessions = /\/api\/auth\/list-sessions(\?.*)?$/
    await page.route(assistants, failReads(webOrigin))
    await page.route(sessions, failReads(webOrigin))
    await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
    await seeText(page, 'assistenten-ladefehler', COPY.server, 'Row F')
    await page.getByText(COPY.devicesLoadError).waitFor({ state: 'visible', timeout: 20_000 })
    if ((await page.getByText('Keine Assistenten verbunden.', { exact: true }).count()) !== 0) fail('Row F: a failed load must not say no assistant is connected')
    await page.unroute(assistants)
    await page.unroute(sessions)
    await byId(page, 'assistenten-erneut-laden').click()
    const address = await seeText(page, 'assistenten-server-adresse', '/mcp', 'Row F')
    if (address !== `${apiOrigin}/mcp`) fail(`Row F: the server address must be ${apiOrigin}/mcp, got „${address}“`)
    await seeText(page, `assistent-ziel-${client.client_id}`, 'localhost', 'Row F')
    await seeText(page, `assistent-rechte-${client.client_id}`, COPY.scopeRead, 'Row F')
    await byId(page, 'geraete-erneut-laden').click()
    await byId(page, 'geraet-zeile-aktuell').waitFor({ state: 'visible', timeout: 20_000 })
    if ((await byId(page, 'geraete-erneut-laden').count()) !== 0) fail('Row F: the device retry must go once the list loaded')
    console.log(`[${TAG}] ✅ Row F — assistants and devices fail to load, say so, and come back with the assistant's rights and destination`)

    // Row F — the owl's consent fails to load: no endless „Wird geladen …“, a retry, then it can be given.
    const owlConsent = /\/v1\/eulen-modus\/personendaten-einwilligung(\?.*)?$/
    await page.route(owlConsent, failReads(webOrigin))
    await page.goto(`${webOrigin}/app/profil/datenschutz`, { waitUntil: 'networkidle' })
    await seeText(page, 'eulen-einwilligung-ladefehler', COPY.server, 'Row F')
    await page.unroute(owlConsent)
    await byId(page, 'eulen-einwilligung-erneut').click()
    await page.getByText(COPY.owlNotGranted, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('button', { name: COPY.owlAllow, exact: true }).click()
    await page.getByText(new RegExp(`^${COPY.owlGrantedPrefix} `)).waitFor({ state: 'visible', timeout: 20_000 })
    if ((await call(api, 'GET', '/v1/eulen-modus/personendaten-einwilligung')).granted !== true) fail('Row F: the consent given after the retry must be stored')

    // Row F — the chat: who receives a message, said before the first one; the stored documents fail and come back.
    const upload = await api.post('/v1/belege/upload', { multipart: { file: { name: 'quittung-zustaende.png', mimeType: 'image/png', buffer: TINY_PNG }, kind: 'Sonstiges', belegdatum: '2025-03-01' } })
    if (upload.status() !== 201) fail(`Row F: uploading a document answered ${upload.status()}`)
    const receiptId = (await upload.json()).id
    const receiptList = (url) => url.pathname === '/v1/belege'
    await page.route(receiptList, failReads(webOrigin))
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await byId(page, 'advisor-chat-input').waitFor({ state: 'visible', timeout: 20_000 })
    await seeText(page, 'advisor-privacy-notice', COPY.privacyNotice, 'Row F')
    await byId(page, 'advisor-receipt-attach-btn').click()
    await byId(page, 'advisor-receipt-panel').waitFor({ state: 'visible', timeout: 10_000 })
    await byId(page, 'advisor-stored-receipts-toggle').click()
    await seeText(page, 'advisor-stored-receipts-ladefehler', COPY.server, 'Row F')
    if ((await page.getByText('In deinen Belegen liegt noch keine Datei.', { exact: true }).count()) !== 0) fail('Row F: a failed load must not say there is no document')
    await page.unroute(receiptList)
    await byId(page, 'advisor-stored-receipts-erneut').click()
    await seeText(page, `advisor-stored-receipt-${receiptId}`, 'quittung-zustaende.png', 'Row F')
    if ((await byId(page, 'advisor-stored-receipts-ladefehler').count()) !== 0) fail('Row F: the error must go once the documents loaded')
    console.log(`[${TAG}] ✅ Row F — the owl's consent and the chat's stored documents fail, say so and come back; the chat names who receives a message`)

    // Row G — an older session approving another device confirms the password first.
    const desktop = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
    await waitForBucketHeadroom(DEVICE_BUCKET, 'device-code', TAG)
    const codeRes = await desktop.post('/v1/device/code')
    if (codeRes.status() !== 201) fail(`Row G: POST /v1/device/code answered ${codeRes.status()}`)
    const deviceCode = await codeRes.json()
    await desktop.dispose()
    ageSessions(sql, email)
    await waitForBucketHeadroom(DEVICE_BUCKET, 'device-pending', TAG)
    await page.goto(deviceCode.verificationUriComplete, { waitUntil: 'networkidle' })
    const firstApprove = page.waitForResponse((r) => r.url().includes('/v1/device/approve') && r.request().method() === 'POST', { timeout: 15_000 })
    await byId(page, 'geraet-freigeben').click()
    if ((await firstApprove).status() !== 400) fail('Row G: an older session must be refused the approval until it confirms (400 FRESH_AUTH_REQUIRED)')
    await seeText(page, 'geraet-freigeben-stepup', COPY.stepUpHeading, 'Row G')
    await expectDisabled(page, 'geraet-freigeben', true, 'Row G (step-up open)')
    await byId(page, 'geraet-freigeben-stepup-passwort').fill(PASSWORD)
    await waitForBucketHeadroom(AUTH_BUCKET, 'verify-password', TAG)
    const secondApprove = page.waitForResponse((r) => r.url().includes('/v1/device/approve') && r.request().method() === 'POST', { timeout: 15_000 })
    await byId(page, 'geraet-freigeben-stepup-bestaetigen').click()
    if (!(await secondApprove).ok()) fail('Row G: after the password the approval must go through')
    await page.getByText(COPY.deviceApproved, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[${TAG}] ✅ Row G — an older session is asked for the password before it signs another device in, then it does`)

    // Row H — change the password in Sicherheit.
    await page.goto(`${webOrigin}/app/profil/sicherheit`, { waitUntil: 'networkidle' })
    await byId(page, 'passwort-aendern').waitFor({ state: 'visible', timeout: 20_000 })
    await expectDisabled(page, 'passwort-aendern-speichern', true, 'Row H (empty form)')
    await byId(page, 'passwort-aktuell').fill(PASSWORD)
    await byId(page, 'passwort-neu').fill(NEW_PASSWORD)
    await byId(page, 'passwort-wiederholen').fill(`${NEW_PASSWORD}x`)
    await byId(page, 'passwort-aendern-speichern').click()
    await page.getByText(COPY.passwordMismatch, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    if ((await byId(page, 'passwort-geaendert').count()) !== 0) fail('Row H: two different new passwords must not change it')
    await byId(page, 'passwort-wiederholen').fill(NEW_PASSWORD)
    await waitForBucketHeadroom(AUTH_BUCKET, 'change-password', TAG)
    await byId(page, 'passwort-aendern-speichern').click()
    await seeText(page, 'passwort-geaendert', COPY.passwordChanged, 'Row H')
    const withNew = await apiSignIn(apiOrigin, webOrigin, email, NEW_PASSWORD)
    if (!withNew.res.ok()) fail(`Row H: the new password must sign in, got ${withNew.res.status()}`)

    // The session is ended elsewhere: the next request opens the sign-in with the expiry notice. The Belege tab
    // was not opened since the last load, so opening it mounts its list and sends that request.
    const revoked = await withNew.api.post('/api/auth/revoke-other-sessions', { data: {} })
    if (!revoked.ok()) fail(`Row H: revoking the other sessions answered ${revoked.status()}`)
    await withNew.api.dispose()
    await api.dispose()
    const refused = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/v1/') && r.status() === 401, { timeout: 20_000 })
    await page.getByRole('tab', { name: 'Belege' }).click()
    const refusal = await (await refused).json().catch(() => null)
    if (refusal?.code !== 'SESSION_EXPIRED') fail(`Row H: the request of an ended session must be refused with SESSION_EXPIRED, got ${JSON.stringify(refusal)}`)
    await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.has('expired'), { timeout: 20_000 })
    await seeText(page, 'anmeldung-abgelaufen', COPY.sessionExpired, 'Row H')
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await submitLogin(page, email, NEW_PASSWORD)
    await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 20_000 })

    // Signing out from the profile ends the session.
    await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
    await byId(page, 'profil-abmelden').click()
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).waitFor({ state: 'visible', timeout: 20_000 })
    const afterSignOut = await ctx.request.get(`${apiOrigin}/api/auth/get-session`, { headers: { origin: webOrigin } })
    if ((await afterSignOut.json().catch(() => null))?.session) fail('Row H: „Abmelden“ must end the session')
    console.log(`[${TAG}] ✅ Row H — password changed (mismatch refused); a session ended elsewhere opens the sign-in with its notice; „Abmelden“ ends it`)
  })
  await ctx.close()
}

async function main() {
  const stack = await startStack()
  const browser = await launchBrowser()
  try {
    await guestAndMailLinks(browser, stack)
    await signedInAccount(browser, stack)
    console.log(`[${TAG}] PASS — guest, mail links, unconfirmed account, Sicherheit, OAuth consent, load failures, device step-up and password change verified.`)
  } finally {
    await closeBrowser(browser)
    await stack.stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
