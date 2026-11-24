// Shared Playwright harness for standalone and composite E2E scenarios.
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../../harness/browser.mjs'
import { startStack as bootStack, makeSql } from '../../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../../harness/rate-limit.mjs'
import { skipSplash } from '../../harness/flows.mjs'
import { verifyEmailSql, whereEmail } from '../../harness/email-hash.mjs'

const require = createRequire(import.meta.url)
const { PDFDocument } = require('../../../apps/api/node_modules/pdf-lib')

export const AUTH_BUCKET = { windowMs: 11_000, max: 2, shared: true }
export const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// The stack a scenario runs on: `registerAndOnboard` needs its database to verify the new address, which a
// real user does with the link in the mail (ADR-0109). Remembered here so no scenario has to thread it through.
let stackSql = null

/** Boots or attaches the stack like `harness/stack.mjs` and remembers its database for `registerAndOnboard`. */
export async function startStack(...args) {
  const stack = await bootStack(...args)
  stackSql = stack.sql
  return stack
}

export {
  launchBrowser,
  closeBrowser,
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  waitForBucketHeadroom,
  skipSplash,
  PDFDocument,
}

/**
 * Registers a new user account through RegistrationScreen, completes OnboardingScreen as the guest the sign-up
 * leaves (sign-up returns no session, ADR-0109), then does what the mail's link and the login would: verifies the
 * address in the database and signs in, which moves the guest's data to the account (ADR-0012). The page is
 * reloaded as the signed-in account and waits for the Cockpit again.
 */
export async function registerAndOnboard(
  page,
  { email, password = TEST_PASSWORD, firstName, lastName, taxId, taxNumber },
  webOrigin,
  callerLabel = 'scenario',
) {
  // Count requests from the start, so that later waits know when the page is really quiet.
  watchRequests(page)
  await waitForBucketHeadroom(AUTH_BUCKET, 'auth', callerLabel)
  await skipSplash(page, webOrigin)

  // Navigate to RegistrationScreen from LoginScreen
  const registerLink = page.locator('[data-testid="login-register-link"]')
  await registerLink.waitFor({ state: 'visible', timeout: 10_000 })
  await registerLink.click()

  // Registration form
  const emailInput = page.locator('[data-testid="registrierung-email"]')
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 })
  await emailInput.fill(email)
  await page.locator('[data-testid="registrierung-passwort"]').fill(password)
  // The API origin is whatever the page's sign-up call goes to: no scenario has to pass it in.
  const signUpRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/sign-up/email'), { timeout: 10_000 })
  await page.locator('[data-testid="registrierung-submit"]').click()
  const apiOrigin = new URL((await signUpRequest).url()).origin

  // Registration success screen
  const continueButton = page.locator('[data-testid="registrierung-success-weiter"]')
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
  await continueButton.click()

  // Onboarding Step 0: Name
  await page.locator('[data-testid="onboarding-vorname"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-vorname"]').fill(firstName)
  await page.locator('[data-testid="onboarding-nachname"]').fill(lastName)
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 1: Steuer-ID
  await page.locator('[data-testid="onboarding-steuerid"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="onboarding-steuerid"]').fill(taxId)
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 2: Steuernummer
  if (taxNumber) {
    await page.locator('[data-testid="onboarding-steuernummer"]').fill(taxNumber)
  }
  await page.locator('[data-testid="onboarding-weiter"]').click()

  // Onboarding Step 3: Summary save
  const saveButton = page.locator('[data-testid="onboarding-speichern"]')
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saveButton.click()

  // Wait for Cockpit to load
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 15_000 })

  await verifyAndSignInAccount(page, { email, password, apiOrigin, webOrigin, callerLabel })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-testid="cockpit-interview"]').waitFor({ state: 'visible', timeout: 15_000 })
}

/**
 * Marks the address verified (the mail's link) and signs the browser context in through the API, with the
 * guest cookie still in the context so the guest's data moves to the account. Cookies set by the API land
 * in the context's jar, so the next page load is the account.
 */
export async function verifyAndSignInAccount(page, { email, password = TEST_PASSWORD, apiOrigin, webOrigin, callerLabel = 'scenario' }) {
  const sql = stackSql ?? makeSql(process.env.DATABASE_URL)
  sql(verifyEmailSql(email))
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', callerLabel)
  const response = await page.context().request.post(`${apiOrigin}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { origin: webOrigin },
  })
  if (!response.ok()) fail(`${callerLabel}: sign-in after verification failed (${response.status()}): ${(await response.text()).slice(0, 200)}`)
}

const TILE_READY_CSS = {
  lstb: '[data-testid="lstb-bruttoarbeitslohn"]',
  ch: '[data-testid="ch-wohnsitz-deutschland"], [data-testid="ch-tage-input"], [data-testid="ch-feld-lohn"]',
  lebenslagen: '[data-testid^="katalog-option-"], [data-testid^="katalog-input-"]',
  einkuenfte: '[data-testid^="katalog-option-"], [data-testid^="katalog-input-"]',
  sonderausgaben: '[data-testid^="katalog-option-"], [data-testid^="katalog-input-"]',
  arbeitsweg: '[data-testid="arbeitstage-urlaub"]',
  kapital: '[data-testid="kapital-frage-beantworten"], [data-testid="kapital-kapitalertraege"]',
  vermietung: '[data-testid="objekt-hinzufuegen"], [data-testid="vermietung-0-mieteinnahmen"], [data-testid="vermietung-frage-beantworten"]',
  kinder: '[data-testid="kind-neu"], [data-testid="kind-vorname"]',
}

/** Requests in flight per page, counted from the first time the page is watched. */
const inFlight = new WeakMap()

function watchRequests(page) {
  let state = inFlight.get(page)
  if (state) return state
  state = { open: new Set(), lastChange: Date.now() }
  const touch = () => (state.lastChange = Date.now())
  // Long-lived streams (SSE) never finish and must not hold the cockpit back.
  const counts = (request) => !['eventsource', 'websocket'].includes(request.resourceType())
  page.on('request', (request) => {
    if (!counts(request)) return
    state.open.add(request)
    touch()
  })
  const done = (request) => {
    if (state.open.delete(request)) touch()
  }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  inFlight.set(page, state)
  return state
}

/**
 * Waits until the page has had no request in flight for `quietMs`. `waitForLoadState('networkidle')`
 * does not do that in a single-page app: it is a milestone of the first load and returns at once
 * afterwards, so the cockpit was clicked while it was still refetching and opened the wrong mask.
 */
export async function waitForNetworkQuiet(page, quietMs = 400, timeoutMs = 15_000) {
  const state = watchRequests(page)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (state.open.size === 0 && Date.now() - state.lastChange >= quietMs) return
    await page.waitForTimeout(50)
  }
}

async function waitForCockpitSettled(page) {
  watchRequests(page)
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 15_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 15_000 })
  // The mask that was just left saves, the cockpit refetches: only then does "Weiter" know the next step.
  await waitForNetworkQuiet(page)
}

function tileReadyLocator(page, tileId) {
  if (tileId === 'rente') return page.locator('text=Welche Rente beziehst du?')
  const css = TILE_READY_CSS[tileId]
  if (!css) throw new Error(`Unknown cockpit tileId: "${tileId}"`)
  return page.locator(css).first()
}

/** Clicks a specific Cockpit tile (`cockpit-kachel-<tileId>`) and waits until its mask is visible. */
export async function openTile(page, tileId) {
  await waitForCockpitSettled(page)
  const tile = page.locator(`[data-testid="cockpit-kachel-${tileId}"]`)
  await tile.waitFor({ state: 'visible', timeout: 10_000 })
  await tile.click()
  await tileReadyLocator(page, tileId).waitFor({ state: 'visible', timeout: 10_000 })
}

// ---- The Strom (ADR-0089) ---------------------------------------------------------------------

/** Waits until the Strom shows the step with this address segment (e.g. `auswahl`, `spenden`). */
export async function waitForStromStep(page, slug) {
  try {
    const wanted = page.locator(`[data-testid="strom-schritt-${slug}"]`)
    // A married household meets Person B's steps on the way (partner name, B's masks). A scenario that
    // does not record B goes on to the step it waits for at its own address, as a user could.
    const partner = page.locator('[data-testid^="strom-schritt-partner"]')
    await wanted.or(partner).first().waitFor({ state: 'visible', timeout: 15_000 })
    if (!slug.startsWith('partner') && !(await wanted.isVisible()) && (await partner.first().isVisible())) {
      const url = new URL(page.url())
      url.pathname = url.pathname.replace(/\/strom\/[^/]+$/, `/strom/${slug}`)
      await page.goto(url.toString(), { waitUntil: 'networkidle' })
      await wanted.waitFor({ state: 'visible', timeout: 15_000 })
    }
  } catch (err) {
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 600)
    throw new Error(`Strom step "${slug}" did not appear; at ${page.url()}:\n${text}`, { cause: err })
  }
}

/**
 * Answers the Strom's basis page (the Minimal-Gate on one page) and presses Weiter.
 * `answers`: { job, ausland, kinder, familienstand, partnerJob?, partnerAusland? } — the partner's
 * answers may also be given under their question ids ('partner-job', 'partner-ausland').
 */
export async function answerBasis(page, answers) {
  await waitForStromStep(page, 'basis')
  const pick = (id, value) => page.locator(`[data-testid="interview-option-${id}-${value}"]`).click()
  await pick('job', answers.job)
  // With the self-employment switch on (ADR-0101 §22), a pensioner is asked about a business on the side; unless the
  // scenario says so, there is none.
  if (answers.job === 'Rente') {
    const sideBusiness = page.locator('[data-testid="strom-feld-rente-selbststaendig"]')
    if (await sideBusiness.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) await pick('rente-selbststaendig', answers['rente-selbststaendig'] ?? 'Nein')
  }
  if (await page.locator('[data-testid="strom-feld-ausland"]').isVisible()) await pick('ausland', answers.ausland)
  // A Grenzgänger is asked whether there was a German job too; unless the scenario says so, there was not.
  if (await page.locator('[data-testid="strom-feld-de-job"]').isVisible()) await pick('de-job', answers['de-job'] ?? 'Nur in der Schweiz')
  if (await page.locator('[data-testid="strom-feld-kinder"]').isVisible()) await pick('kinder', answers.kinder)
  if (await page.locator('[data-testid="strom-feld-familienstand"]').isVisible()) await pick('familienstand', answers.familienstand)
  const partnerJob = answers['partner-job'] ?? answers.partnerJob
  const partnerAusland = answers['partner-ausland'] ?? answers.partnerAusland
  if (partnerJob) await pick('partner-job', partnerJob)
  if (partnerAusland) await pick('partner-ausland', partnerAusland)
  if (await page.locator('[data-testid="strom-feld-partner-de-job"]').isVisible()) await pick('partner-de-job', answers['partner-de-job'] ?? 'Nur in der Schweiz')
  await page.locator('[data-testid="strom-weiter"]').click()
}

/**
 * The selection page: taps each topic (with its kind where it has one, e.g. { nebenjob: 'Midijob' })
 * and presses Weiter. Rare topics are opened behind „Mehr anzeigen“ first.
 */
export async function chooseTopics(page, topics, kinds = {}) {
  await waitForStromStep(page, 'auswahl')
  const more = page.locator('[data-testid="strom-mehr"]')
  if (await more.isVisible()) await more.click()
  for (const topic of topics) {
    await page.locator(`[data-testid="strom-thema-${topic}"]`).click()
    if (kinds[topic]) await page.locator(`[data-testid="strom-art-${topic}-${kinds[topic]}"]`).click()
  }
  await page.locator('[data-testid="strom-weiter"]').click()
  const confirm = page.locator('[data-testid="strom-abwaehlen-ja"]')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
}

/** Fills a topic page: `fields` maps a question id to an amount (string/number) or an option value. */
export async function fillTopic(page, slug, fields) {
  await waitForStromStep(page, slug)
  for (const [id, value] of Object.entries(fields)) {
    const input = page.locator(`[data-testid="katalog-input-${id}"]`)
    if (await input.count()) await input.fill(String(value))
    else await page.locator(`[data-testid="katalog-option-${id}-${value}"]`).click()
  }
  await page.locator('[data-testid="strom-weiter"]').click()
}

/** Leaves the Strom for the cockpit (from any Strom step, also the summary). */
export async function leaveStrom(page) {
  const summary = page.locator('[data-testid="strom-cockpit"]')
  if (await summary.isVisible().catch(() => false)) await summary.click()
  else await page.locator('[data-testid="strom-pause"]').first().click()
  // Before the basis is answered the cockpit has no tiles yet, only its „Fragen beantworten“.
  await page.locator('[data-testid="cockpit-kacheln"], [data-testid="cockpit-interview"]').first().waitFor({ state: 'visible', timeout: 15_000 })
}

/** Switches the Cockpit tax year to 2025. */
export async function selectTaxYear2025(page) {
  await selectTaxYear(page, 2025)
}

/** Switches the Cockpit tax year to a given year. */
export async function selectTaxYear(page, year) {
  const chip = page.locator(`[data-testid="jahr-${year}"]`)
  await chip.waitFor({ state: 'visible', timeout: 10_000 })
  await chip.click()
  await page.waitForTimeout(400)
}

/**
 * Reads the Cockpit estimate ("Voraussichtlich 1.234 – 1.456 € Erstattung", or one value) and checks it
 * against the scenario's independent reference.
 */
export async function assertEstimate(page, label, { direction, contains } = {}) {
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 15_000 })
  const locator = page.locator('[data-testid="cockpit-erstattung"]')
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  // The figure is read once the cockpit has refetched after the last mask, not while it still shows the old one.
  await waitForNetworkQuiet(page)
  const check = (text) => {
    const named = direction === undefined ? ['Erstattung', 'Nachzahlung'].some((w) => text.includes(w)) : text.includes(direction)
    if (!named) return `expected a ${direction ?? 'refund or back-payment'} estimate`
    const amounts = [...text.matchAll(/\d{1,3}(?:\.\d{3})*/g)].map((m) => Number(m[0].replace(/\./g, '')))
    if (amounts.length === 0) return 'the estimate names no amount'
    const from = Math.min(...amounts)
    const to = Math.max(...amounts)
    if (contains !== undefined && (contains < from || contains > to)) {
      return `the hand-calculated ${direction} of ${contains} € is outside the Cockpit's ${from}–${to} €`
    }
    return null
  }
  const deadline = Date.now() + 15_000
  let text = await locator.innerText()
  let problem = check(text)
  while (problem !== null && Date.now() < deadline) {
    await page.waitForTimeout(500)
    text = await locator.innerText()
    problem = check(text)
  }
  console.log(`[${label}] Cockpit estimate text: "${text}"`)
  if (problem !== null) fail(`[${label}] ${problem}: "${text}"`)
  await assertRefundLeadsHero(page, label)
}

/**
 * UX review H1: with a range the refund is the hero's headline and its figure stands on its own, while
 * the recorded income stays visible below it.
 */
async function assertRefundLeadsHero(page, label) {
  if ((await page.locator('[data-testid="cockpit-erstattung-betrag"]').count()) === 0) return
  if (!/\d/.test(await page.locator('[data-testid="cockpit-erstattung-betrag"]').innerText())) fail(`[${label}] the refund headline names no figure`)
  if (!(await page.locator('[data-testid="cockpit-einkommen"]').isVisible())) fail(`[${label}] the recorded income must stay visible below the refund headline`)
}

/** Asserts Cockpit estimate direction, minAmount, or exact expectedText. */
export async function assertCockpitEstimate(page, label, { direction, minAmount, expectedText } = {}) {
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 15_000 })
  const locator = page.locator('[data-testid="cockpit-erstattung"]')
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  // The figure is read once the cockpit has refetched after the last mask, not while it still shows the old one.
  await waitForNetworkQuiet(page)

  const check = (text) => {
    if (expectedText !== undefined) {
      return text.includes(expectedText) ? null : `expected estimate to contain "${expectedText}"`
    }
    const named = direction === undefined ? ['Erstattung', 'Nachzahlung'].some((w) => text.includes(w)) : text.includes(direction)
    if (!named) return `expected a ${direction ?? 'refund or back-payment'} estimate`
    const amounts = [...text.matchAll(/\d{1,3}(?:\.\d{3})*/g)].map((m) => Number(m[0].replace(/\./g, '')))
    if (amounts.length === 0) return 'the estimate names no amount'
    const max = Math.max(...amounts)
    if (minAmount !== undefined && max < minAmount) return `expected amount to be at least ${minAmount} € but got max ${max} €`
    return null
  }

  const deadline = Date.now() + 15_000
  let text = await locator.innerText()
  let problem = check(text)
  while (problem !== null && Date.now() < deadline) {
    await page.waitForTimeout(500)
    text = await locator.innerText()
    problem = check(text)
  }
  console.log(`[${label}] Cockpit estimate text: "${text}"`)
  if (problem !== null) fail(`[${label}] ${problem}: "${text}"`)
}

/** Unlocks a tax year directly in the database for payment-free e2e printout access. */
export function unlockTaxYearInDb(sql, email, year) {
  const userId = sql(`SELECT id FROM "User" WHERE ${whereEmail(email)};`).trim()
  if (!userId) fail(`unlockTaxYearInDb: user with email ${email} not found in database`)
  sql(
    `INSERT INTO "Freischaltung" ("id", "userId", "steuerjahr", "status", "stripeCheckoutSessionId", "createdAt", "updatedAt") ` +
      `VALUES (gen_random_uuid(), '${userId}', ${year}, 'bezahlt', 'e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}', NOW(), NOW()) ` +
      `ON CONFLICT DO NOTHING;`,
  )
}

/** Confirms all unconfirmed annexes on ConfirmationScreen if any are pending. */
export async function confirmAnnexesIfPresent(page) {
  const openConfirmButton = page.locator('[data-testid="ausdruck-bestaetigung-oeffnen"]')
  if ((await openConfirmButton.count()) > 0 && (await openConfirmButton.isVisible())) {
    await openConfirmButton.click()
    await page.locator('[data-testid="bestaetigung-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })

    while (true) {
      const confirmButton = page.locator('[data-testid^="bestaetige-"]').first()
      if ((await confirmButton.count()) === 0 || !(await confirmButton.isVisible())) break
      await confirmButton.click()
      await page.waitForTimeout(400)
    }

    await page.locator('[data-testid="bestaetigung-zurueck"]').click()
    await page.locator('[data-testid="ausdruck-zurueck"]').waitFor({ state: 'visible', timeout: 10_000 })
  }
}

/**
 * Picks the exchange-rate month (`YYYY-MM`), types the rate and saves — and only returns once the
 * server has answered the save. The month chips sit below fields that save on blur; the screen can
 * still be settling when the click lands, and a missed month means the save button sends nothing.
 * Trusting the click alone left the rate unsaved and the printout locked several screens later.
 */
export async function saveExchangeRate(page, month, rate) {
  await page.locator('[data-testid="ch-wechselkurs-monat"]').waitFor({ state: 'visible', timeout: 10_000 })
  const chip = page.locator(`[data-testid="ch-wechselkurs-monat-${month.slice(5)}"]`)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await chip.click()
    await page.locator('[data-testid="ch-wechselkurs-kurs"]').fill(rate)
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === 'PUT' && res.url().includes('/wechselkurs'), { timeout: 5_000 }).catch(() => null),
      page.locator('[data-testid="ch-wechselkurs-speichern"]').click(),
    ])
    if (response?.ok()) return
  }
  fail(`saveExchangeRate: the exchange rate for ${month} was not saved after three attempts`)
}

/** Downloads the editable PDF and verifies expected PDF form field values. */
export async function downloadAndVerifyPdf(page, expectedFields) {
  const downloadButton = page.locator('[data-testid="ausdruck-herunterladen-bearbeitbar"]')
  await downloadButton.waitFor({ state: 'visible', timeout: 15_000 })
  // The button is disabled while the printout check is still loading — wait for it, fail only after the timeout.
  const enabled = await page
    .waitForFunction((el) => el !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true', await downloadButton.elementHandle(), { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!enabled) {
    // The printout screen is the last container; the first one is the step underneath it and says nothing about why.
    const errorCard = await page.locator('[data-testid="screen-container"]').last().innerText().catch(() => '')
    fail(`downloadAndVerifyPdf: download button is disabled. Screen content:\n${errorCard}`)
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    downloadButton.click(),
  ])

  const filePath = await download.path()
  const pdfBytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(pdfBytes)
  const form = doc.getForm()

  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    let actualValue
    try {
      const field = form.getField(key)
      actualValue = typeof field.getText === 'function' ? (field.getText() ?? '') : field.isChecked?.() ? 'X' : ''
    } catch (error) {
      fail(`downloadAndVerifyPdf: missing PDF form field "${key}" — ${error.message}`)
    }
    if (actualValue !== expectedValue) {
      fail(`downloadAndVerifyPdf: field "${key}" expected "${expectedValue}" but got "${actualValue}"`)
    }
  }
}

/** Runs a single scenario function standalone (starts/attaches stack and browser, runs scenario, cleans up). */
export async function runStandaloneScenario(title, fn) {
  console.log('='.repeat(80))
  console.log(`STARTING SCENARIO: ${title}`)
  console.log('='.repeat(80))

  const stack = await startStack()
  const browser = await launchBrowser()
  try {
    await fn(browser, stack.webOrigin, stack.sql)
    console.log('\n' + '='.repeat(80))
    console.log(`PASS: ${title}`)
    console.log('='.repeat(80) + '\n')
  } catch (error) {
    fail(`${title} failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    if (typeof stack.stop === 'function') {
      await stack.stop()
    }
  }
}
