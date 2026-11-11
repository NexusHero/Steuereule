// Shared Playwright harness for standalone and composite E2E scenarios.
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../../harness/browser.mjs'
import { startStack } from '../../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../../harness/rate-limit.mjs'
import { skipSplash } from '../../harness/flows.mjs'

const require = createRequire(import.meta.url)
const { PDFDocument } = require('../../../apps/api/node_modules/pdf-lib')

export const AUTH_BUCKET = { windowMs: 11_000, max: 2, shared: true }
export const TEST_PASSWORD = 'Sicheres-Passwort-1!'

export {
  launchBrowser,
  closeBrowser,
  newContextAtBreakpoint,
  guardAgainst429,
  startStack,
  fail,
  waitForBucketHeadroom,
  skipSplash,
  PDFDocument,
}

/** Registers a new user account through RegistrationScreen, then completes OnboardingScreen. */
export async function registerAndOnboard(
  page,
  { email, password = TEST_PASSWORD, firstName, lastName, taxId, taxNumber },
  webOrigin,
  callerLabel = 'scenario',
) {
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
  await page.locator('[data-testid="registrierung-submit"]').click()

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

const ANY_TILE_CSS = Object.values(TILE_READY_CSS).join(', ')

async function waitForCockpitSettled(page) {
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 15_000 })
  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(100)
  await page.waitForLoadState('networkidle').catch(() => {})
}

function tileReadyLocator(page, tileId) {
  if (tileId === 'rente') return page.locator('text=Welche Rente beziehst du?')
  const css = TILE_READY_CSS[tileId]
  if (!css) throw new Error(`Unknown cockpit tileId: "${tileId}"`)
  return page.locator(css).first()
}

function anyMaskReadyLocator(page) {
  return page.locator(ANY_TILE_CSS).or(page.locator('text=Welche Rente beziehst du?')).first()
}

/** Clicks a specific Cockpit tile (`cockpit-kachel-<tileId>`) and waits until its mask is visible. */
export async function openTile(page, tileId) {
  await waitForCockpitSettled(page)
  const tile = page.locator(`[data-testid="cockpit-kachel-${tileId}"]`)
  await tile.waitFor({ state: 'visible', timeout: 10_000 })
  await tile.click()
  await tileReadyLocator(page, tileId).waitFor({ state: 'visible', timeout: 10_000 })
}

/** Clicks the Cockpit "Nächster Schritt" CTA (`cockpit-weiter`) and waits until the target mask is visible. */
export async function nextStep(page) {
  await waitForCockpitSettled(page)
  const nextBtn = page.locator('[data-testid="cockpit-weiter"]')
  await nextBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await nextBtn.click()
  await anyMaskReadyLocator(page).waitFor({ state: 'visible', timeout: 10_000 })
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
  await page.waitForLoadState('networkidle').catch(() => {})
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
}

/** Asserts Cockpit estimate direction, minAmount, or exact expectedText. */
export async function assertCockpitEstimate(page, label, { direction, minAmount, expectedText } = {}) {
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 15_000 })
  const locator = page.locator('[data-testid="cockpit-erstattung"]')
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

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
  const userId = sql(`SELECT id FROM "User" WHERE email = '${email}';`).trim()
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
  const chip = page.locator(`[data-testid="ch-wechselkurs-monat-${month.slice(5)}"]`)
  await chip.waitFor({ state: 'visible', timeout: 10_000 })
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
