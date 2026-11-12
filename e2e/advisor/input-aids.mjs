// Input aids gate (#451 slices 2–4, AC 5–7, AC 10): autofill attributes in the real DOM, the
// PLZ → Ort/Bundesland prefill (marked, changeable, a choice for several places), the dictation
// hint (dismissed once, stays dismissed), and — for all of it — not a single request to a host
// other than the app's own two origins.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'input-aids'
const YEAR = 2025

async function expectAutocomplete(page, selector, expected, label) {
  const el = page.locator(selector).first()
  await el.waitFor({ state: 'attached', timeout: 10_000 })
  const actual = await el.getAttribute('autocomplete')
  if (actual !== expected) fail(`${label}: expected autocomplete="${expected}", got "${actual}"`)
}

function watchForeignRequests(page, origins) {
  const foreign = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (!origins.has(url.origin)) foreign.push(req.url())
  })
  return foreign
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const email = `input-aids-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    const foreign = watchForeignRequests(page, new Set([new URL(apiOrigin).origin, new URL(webOrigin).origin]))

    // Row A — autofill on the sign-up and sign-in forms (AC 5).
    await page.goto(`${webOrigin}/registrierung`, { waitUntil: 'networkidle' })
    await expectAutocomplete(page, '[data-testid="registrierung-email"]', 'email', 'Registrierung E-Mail')
    await expectAutocomplete(page, '[data-testid="registrierung-passwort"]', 'new-password', 'Registrierung Passwort')

    await skipSplash(page, webOrigin)
    const loginEmail = page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder)
    const loginPassword = page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder)
    if ((await loginEmail.getAttribute('autocomplete')) !== 'email') fail('Login E-Mail: expected autocomplete="email"')
    if ((await loginPassword.getAttribute('autocomplete')) !== 'current-password') fail('Login Passwort: expected autocomplete="current-password"')
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await loginEmail.fill(email)
    await loginPassword.fill(TEST_PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    console.log(`[${TAG}] ✅ Row A — sign-up and sign-in carry email / new-password / current-password`)

    // Row B — the master data address carries its autofill hints, and the PLZ fills the Ort (AC 5, AC 6).
    await page.goto(`${webOrigin}/app/profil/stammdaten`, { waitUntil: 'networkidle' })
    await expectAutocomplete(page, '[data-testid="stammdaten-geburtsdatum"]', 'bday', 'Stammdaten Geburtsdatum')
    await expectAutocomplete(page, '[data-testid="stammdaten-strasse"]', 'address-line1', 'Stammdaten Straße')
    await expectAutocomplete(page, '[data-testid="stammdaten-plz"]', 'postal-code', 'Stammdaten PLZ')
    await expectAutocomplete(page, '[data-testid="stammdaten-wohnort"]', 'address-level2', 'Stammdaten Wohnort')
    console.log(`[${TAG}] ✅ Row B — master data address fields carry bday / address-line1 / postal-code / address-level2`)

    await page.locator('[data-testid="stammdaten-plz"]').fill('80331')
    const city = page.locator('[data-testid="stammdaten-wohnort"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="stammdaten-wohnort"]')?.value === 'München', null, { timeout: 5_000 }).catch(() => fail('Row C: PLZ 80331 should prefill the Ort with München'))
    await page.locator('[data-testid="stammdaten-ort-aus-plz"]').waitFor({ state: 'visible', timeout: 5_000 })
    const state = await page.locator('[data-testid="stammdaten-bundesland"]').innerText()
    if (!state.includes('Bayern')) fail(`Row C: expected Bundesland Bayern from PLZ 80331, got "${state}"`)
    await city.fill('München-Altstadt')
    if ((await page.locator('[data-testid="stammdaten-ort-aus-plz"]').count()) !== 0) fail('Row C: an edited Ort must lose the "aus deiner PLZ" mark')
    console.log(`[${TAG}] ✅ Row C — PLZ 80331 prefills München + Bayern, marked, and stays changeable`)

    await city.fill('')
    await page.locator('[data-testid="stammdaten-plz"]').fill('21039')
    await page.locator('[data-testid="stammdaten-plz-auswahl"]').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByText('Escheburg', { exact: true }).click()
    if ((await city.inputValue()) !== 'Escheburg') fail('Row D: choosing a place should fill the Ort')
    const borderState = await page.locator('[data-testid="stammdaten-bundesland"]').innerText()
    if (!borderState.includes('Schleswig-Holstein')) fail(`Row D: Escheburg lies in Schleswig-Holstein, got "${borderState}"`)
    console.log(`[${TAG}] ✅ Row D — a cross-border PLZ offers a choice and takes the chosen place's Bundesland`)

    // Row E — amount fields switch autofill off (AC 5).
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/kapital`, { waitUntil: 'networkidle' })
    const numeric = page.locator('input[inputmode="numeric"]')
    await numeric.first().waitFor({ state: 'attached', timeout: 10_000 })
    const values = await numeric.evaluateAll((els) => els.map((el) => el.getAttribute('autocomplete')))
    if (values.length === 0 || values.some((v) => v !== 'off')) fail(`Row E: every amount field must have autocomplete="off", got ${JSON.stringify(values)}`)
    console.log(`[${TAG}] ✅ Row E — ${values.length} amount fields in Kapital carry autocomplete="off"`)

    // Row F — nothing but the field around the composer (#481 removed the dictation tip banner);
    // without WebGPU there is no microphone button either (AC 10).
    await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="advisor-chat-input"]').waitFor({ state: 'visible', timeout: 10_000 })
    if ((await page.locator('[data-testid="advisor-dictation-hint"]').count()) !== 0) fail('Row F: the dictation tip banner is gone since #481')
    if ((await page.locator('[data-testid="advisor-dictation-mic"]').count()) !== 0) fail('Row F: no microphone button without on-device dictation (AC 10)')
    console.log(`[${TAG}] ✅ Row F — no tip banner above the composer, no microphone without on-device dictation`)

    // Row G — nothing above talked to a third host (decision 7).
    if (foreign.length > 0) fail(`Row G: requests left the app's origins: ${foreign.slice(0, 5).join(', ')}`)
    console.log(`[${TAG}] ✅ Row G — no request to any host but the app's own two origins`)

    await ctx.close()
    console.log(`[${TAG}] PASS — autofill, PLZ prefill and a bare composer verified, all on-device.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
