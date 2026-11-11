// #450 5C — the printout end to end without Stripe keys: pay (fake provider, D7), the "paid" event
// arriving on the real webhook endpoint, then both downloads. Needs the API started with
// PAYMENT_FAKE_PROVIDER=1 (refused in production) and no Stripe keys.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, putLstb, browserLogin, until } from '../harness/api-account.mjs'
import { readFile } from 'node:fs/promises'

const TAG = 'printout-unlock'
const YEAR = 2025
const FAKE_SIGNATURE = 'fake-payment-signature'

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await call(api, 'PUT', '/v1/profile', { firstName: 'Mara', lastName: 'Druckfrisch', steuerId: '04452397686' })
    await call(api, 'PUT', '/v1/stammdaten', {
      geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden', religion: 'VD', religionConsent: true,
      familienstand: 'ledig', iban: 'DE89370400440532013000', finanzamt: 'Dresden-Nord',
    })
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig'], ['dhf', 'Nein'], ['umzug', 'Nein'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein'], ['nebenjob', 'Nein'], ['einkuenfte', 'Nein'], ['spenden', 'Nein'], ['kv-pv', 'Nein'], ['riester', 'Nein']])
    await putLstb(api, YEAR, 45_000, 6_100, 9_200)
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace: null })
    const check = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ausdruck/pruefung`)
    if (check.missing.length > 0) fail(`the persona must be printable, still missing: ${check.missing.join(', ')}`)
    if ((await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)).status !== 'offen') fail('with the fake provider the unlock must be "offen" before paying')

    const ctx = await newContextAtBreakpoint(browser, 'l', { acceptDownloads: true })
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/ausdruck`, { waitUntil: 'networkidle' })

    // Locked until paid: the download button is disabled, paying is offered.
    const pay = page.locator('[data-testid="ausdruck-bezahlen"]')
    await pay.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await page.locator('[data-testid="ausdruck-herunterladen"]').count()) !== 0) fail('before paying there must be no download button')
    await pay.click()
    await page.waitForURL((u) => u.pathname.endsWith(`/ausdruck`) && u.search.includes('zahlung=erfolg'), { timeout: 15_000 })
    console.log(`[${TAG}] ✅ ausdruck-bezahlen — checkout returned to the success URL`)

    // The paid event arrives like Stripe's: signed, on the real webhook endpoint.
    const sessionId = sql(`SELECT "stripeCheckoutSessionId" FROM "Freischaltung" ORDER BY "createdAt" DESC LIMIT 1`).trim()
    if (!sessionId.startsWith('fake_cs_')) fail(`expected a fake checkout session, got "${sessionId}"`)
    const bad = await api.post('/v1/zahlung/stripe/webhook', { data: { sessionId }, headers: { 'stripe-signature': 'wrong' } })
    if (bad.status() !== 401) fail(`a wrong signature must be refused with 401, got ${bad.status()}`)
    if ((await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)).status !== 'offen') fail('a refused webhook must not unlock')
    const good = await api.post('/v1/zahlung/stripe/webhook', { data: { sessionId }, headers: { 'stripe-signature': FAKE_SIGNATURE } })
    if (!good.ok()) fail(`the paid event must be accepted, got ${good.status()}`)
    await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/freischaltung`)).status, 'freigeschaltet', 'the paid event must unlock the year')
    console.log(`[${TAG}] ✅ webhook — a wrong signature is refused, the signed paid event unlocks the year`)

    await page.reload({ waitUntil: 'networkidle' })
    const download = page.locator('[data-testid="ausdruck-herunterladen"]')
    await download.waitFor({ state: 'visible', timeout: 15_000 })
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), download.click()])
    const bytes = await readFile(await file.path())
    if (file.suggestedFilename() !== `steuererklaerung-${YEAR}.pdf`) fail(`unexpected file name ${file.suggestedFilename()}`)
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-' || bytes.length < 20_000) fail(`the download is no printout PDF (${bytes.length} bytes)`)
    console.log(`[${TAG}] ✅ ausdruck-herunterladen — ${file.suggestedFilename()}, ${bytes.length} bytes`)

    const editable = page.locator('[data-testid="ausdruck-herunterladen-bearbeitbar"]')
    const [editableFile] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), editable.click()])
    if (editableFile.suggestedFilename() !== `steuererklaerung-${YEAR}-bearbeitbar.pdf`) fail(`unexpected editable file name ${editableFile.suggestedFilename()}`)
    console.log(`[${TAG}] ✅ ausdruck-herunterladen-bearbeitbar — ${editableFile.suggestedFilename()}`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 5C pay → unlock → download verified without Stripe keys.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
