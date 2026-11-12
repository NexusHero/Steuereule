// Smart inputs gate (ADR-0065 and the input aids of the same change): the aids that make the forms
// faster are exercised in a real browser against the real stack — the masks, the calendar, the
// address search on our own server, and the suggestions that are offered but never forced.
//
// The address search needs street data: the API of this job runs with STREET_DATA_PATH pointing at
// e2e/fixtures/streets.sample.csv. Without it the search answers "not available" and Row D fails
// with exactly that message.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'smart-inputs'
const YEAR = 2025
const LAST_NAME = 'Beispiel'
/** testID prefix of the other parent's fields in the child form. */
const OTHER_PARENT = 'kind-ae'

const tid = (id) => `[data-testid="${id}"]`

function watchForeignRequests(page, origins) {
  const foreign = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (!origins.has(url.origin)) foreign.push(req.url())
  })
  return foreign
}

async function expectValue(page, id, expected, label) {
  const matched = await page
    .waitForFunction(([selector, value]) => document.querySelector(selector)?.value === value, [tid(id), expected], { timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!matched) fail(`${label}: expected ${id} to hold "${expected}", got "${await page.locator(tid(id)).inputValue().catch(() => '<missing>')}"`)
}

async function expectText(page, id, part, label) {
  const el = page.locator(tid(id))
  await el.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => fail(`${label}: ${id} did not appear`))
  const text = await el.innerText()
  if (!text.includes(part)) fail(`${label}: expected ${id} to say "${part}", got "${text}"`)
}

/** Types into the address search and takes the first hit; fails with the search's own words if it has none. */
async function pickFirstAddress(page, prefix, query, label) {
  await page.locator(tid(`${prefix}-adresssuche`)).fill(query)
  const first = page.locator(tid(`${prefix}-adresssuche-treffer-0`))
  const found = await first.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)
  if (!found) {
    const said = await page.getByText(/Adresssuche ist gerade nicht verfügbar|Keine passende Straße/).first().innerText().catch(() => 'nothing')
    fail(`${label}: no hit for "${query}" — the search said: "${said}". Is STREET_DATA_PATH set for the API?`)
  }
  const line = await first.innerText()
  await first.click()
  return line
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const email = `smart-inputs-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    const foreign = watchForeignRequests(page, new Set([new URL(apiOrigin).origin, new URL(webOrigin).origin]))

    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await submitLogin(page, email, TEST_PASSWORD)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })

    // The child's last name is suggested from the profile, so the profile needs one.
    const profile = await ctx.request.put(`${apiOrigin}/v1/profile`, {
      headers: { origin: webOrigin },
      data: { firstName: 'Anna', lastName: LAST_NAME, steuerId: '02476291358', steuernummer: '18181508155' },
    })
    if (!profile.ok()) fail(`could not set the profile name: ${profile.status()} ${await profile.text()}`)

    await page.goto(`${webOrigin}/app/profil/stammdaten`, { waitUntil: 'networkidle' })

    // Row A — the IBAN is shown in blocks of four and checked while it is typed.
    await page.locator(tid('stammdaten-iban')).fill('de89370400440532013001')
    await expectValue(page, 'stammdaten-iban', 'DE89 3704 0044 0532 0130 01', 'Row A')
    await expectText(page, 'stammdaten-iban-pruefung', 'stimmt nicht', 'Row A')
    await page.locator(tid('stammdaten-iban')).fill('de89370400440532013000')
    await expectValue(page, 'stammdaten-iban', 'DE89 3704 0044 0532 0130 00', 'Row A')
    await expectText(page, 'stammdaten-iban-pruefung', 'gültig', 'Row A')
    console.log(`[${TAG}] ✅ Row A — IBAN grouped, upper-cased and checked while typing`)

    // Row B — dates: the dots set themselves, and the calendar button hands its pick to the field.
    await page.locator(tid('stammdaten-geburtsdatum')).pressSequentially('12041990')
    await expectValue(page, 'stammdaten-geburtsdatum', '12.04.1990', 'Row B')
    await page.locator(tid('stammdaten-geburtsdatum-kalender-oeffnen')).waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator(tid('stammdaten-geburtsdatum-kalender')).fill('1991-05-13')
    await expectValue(page, 'stammdaten-geburtsdatum', '13.05.1991', 'Row B')
    console.log(`[${TAG}] ✅ Row B — typed digits become 12.04.1990, a calendar pick becomes 13.05.1991`)

    // Row C — "12a" splits into number and Zusatz; the postal code suggests the Finanzamt, a click takes it.
    await page.locator(tid('stammdaten-hausnummer')).fill('12a')
    await expectValue(page, 'stammdaten-hausnummer', '12', 'Row C')
    await expectValue(page, 'stammdaten-hausnummerZusatz', 'a', 'Row C')
    await page.locator(tid('stammdaten-plz')).fill('79539')
    await expectText(page, 'stammdaten-finanzamt-vorschlaege', 'Vorschlag aus deiner Postleitzahl', 'Row C')
    await expectValue(page, 'stammdaten-finanzamt', '', 'Row C (a suggestion is never filled in by itself)')
    await page.locator(tid('stammdaten-finanzamt-vorschlag-0')).click()
    await expectValue(page, 'stammdaten-finanzamt', 'Finanzamt Lörrach', 'Row C')
    console.log(`[${TAG}] ✅ Row C — house number split, Finanzamt Lörrach offered for 79539 and taken on a click`)

    // Row D — one line in the address search fills street, house number, postal code and place.
    const picked = await pickFirstAddress(page, 'stammdaten', 'Hauptstr. 7, Köln', 'Row D')
    if (picked !== 'Hauptstraße 7, 50667 Köln') fail(`Row D: expected the hit "Hauptstraße 7, 50667 Köln", got "${picked}"`)
    await expectValue(page, 'stammdaten-strasse', 'Hauptstraße', 'Row D')
    await expectValue(page, 'stammdaten-hausnummer', '7', 'Row D')
    await expectValue(page, 'stammdaten-plz', '50667', 'Row D')
    await expectValue(page, 'stammdaten-wohnort', 'Köln', 'Row D')
    await expectValue(page, 'stammdaten-adresssuche', '', 'Row D')
    // A pick closes the list: nothing stays open over the fields it just filled.
    for (const id of ['stammdaten-adresssuche-liste', 'stammdaten-adresssuche-treffer-0']) {
      if ((await page.locator(tid(id)).count()) !== 0) fail(`Row D: ${id} must be gone after a pick`)
    }
    console.log(`[${TAG}] ✅ Row D — "Hauptstr. 7, Köln" → Hauptstraße 7, 50667 Köln in four fields`)

    await page.locator(tid('stammdaten-speichern')).click()
    await page.getByText('Gespeichert.').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail('the master data did not save'))

    // Row E — a new child: short form, last name suggested, Familienkasse offered from the saved address.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/kinder`, { waitUntil: 'networkidle' })
    await page.locator(tid('kind-vorname')).waitFor({ state: 'visible', timeout: 10_000 })
    await expectValue(page, 'kind-nachname', LAST_NAME, 'Row E')
    await page.locator(tid('kind-nachname-vorschlag')).waitFor({ state: 'visible', timeout: 5_000 })
    if ((await page.locator(tid('kind-kindergeld')).count()) !== 0) fail('Row E: the optional amounts must be folded away in the short form')
    await page.locator(tid('kind-weitere-angaben')).click()
    await page.locator(tid('kind-kindergeld')).waitFor({ state: 'visible', timeout: 5_000 })
    await expectText(page, 'kind-familienkasse-vorschlaege', 'Vorschlag aus deiner Adresse', 'Row E')
    await page.locator(tid('kind-familienkasse-vorschlag-0')).click()
    await expectValue(page, 'kind-familienkasse', 'Familienkasse Nordrhein-Westfalen Nord', 'Row E')
    console.log(`[${TAG}] ✅ Row E — short form, last name "${LAST_NAME}" suggested, Familienkasse of Nordrhein-Westfalen offered`)

    // Row F — the other parent: address search and date fields work there too.
    await page.locator(tid('kind-ae-Inland')).click()
    await pickFirstAddress(page, OTHER_PARENT, 'Domkloster Köln', 'Row F')
    const otherAddress = await page.getByLabel('Adresse des anderen Elternteils').inputValue()
    if (otherAddress !== 'Domkloster, 50667 Köln') fail(`Row F: expected the other parent's address "Domkloster, 50667 Köln", got "${otherAddress}"`)
    await page.locator(tid(`${OTHER_PARENT}-geburtsdatum`)).pressSequentially('11021984')
    await expectValue(page, `${OTHER_PARENT}-geburtsdatum`, '11.02.1984', 'Row F')
    await page.locator(tid('kind-ae-Verstorben')).click()
    await page.locator(tid(`${OTHER_PARENT}-todestag`)).waitFor({ state: 'visible', timeout: 5_000 })
    await page.locator(tid('kind-ae-Inland')).click()
    console.log(`[${TAG}] ✅ Row F — other parent's address picked from the search, dates masked`)

    // Row G — a second child takes what siblings share on one click.
    await page.locator(tid('kind-vorname')).fill('Lina')
    await page.locator(tid('kind-geburtsdatum')).pressSequentially('12052018')
    await page.locator(tid('kind-verhaeltnis-1')).click()
    await page.locator(tid('kind-inland-ja')).click()
    await page.locator(tid('kind-speichern')).click()
    await page.locator(tid('kind-neu')).waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator(tid('kind-neu')).click()
    await page.locator(tid('kind-geschwister')).waitFor({ state: 'visible', timeout: 5_000 })
    await expectValue(page, 'kind-familienkasse', '', 'Row G (nothing is copied before the click)')
    await page.locator(tid('kind-geschwister-0')).click()
    await expectValue(page, 'kind-familienkasse', 'Familienkasse Nordrhein-Westfalen Nord', 'Row G')
    await expectValue(page, 'kind-vorname', '', 'Row G (the child\'s own data is not copied)')
    await expectText(page, 'kind-geschwister', 'Von Lina übernommen', 'Row G')
    console.log(`[${TAG}] ✅ Row G — "Von Lina übernehmen" copies the shared details, not the child's own`)

    // Row H — the address search talked to our own API only (ADR-0065).
    if (foreign.length > 0) fail(`Row H: requests left the app's origins: ${foreign.slice(0, 5).join(', ')}`)
    console.log(`[${TAG}] ✅ Row H — no request to any host but the app's own two origins`)

    await ctx.close()
    console.log(`[${TAG}] PASS — masks, calendar, address search and suggestions verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
