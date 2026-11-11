// #450 Teil 3C — the scan flows around the corpus, as a CI gate:
//  * upload in the Eule chat: the LStB draft card appears, "Maske prüfen" leads to the mask;
//  * upload in the tab Belege: the original lands encrypted in the inbox;
//  * an OCR photo: every field has to be confirmed on its own before "Werte übernehmen" is possible;
//  * tab switch: the staged draft stays; reload: see the note below;
//  * deleting the receipt removes the encrypted file (crypto-shredding of the account key is the
//    account deletion, covered in e2e/account/account-security.mjs).
//
// Reload: #443 decision 13 says a scanned draft is gone after a reload; #444 made it reload-proof
// through the advisor messages (useLstbScan "rehydrate"). This gate pins the shipped #444 behaviour
// — the draft comes back and is still not written — and the contradiction is listed in the PR.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'scan-flows'
const HERE = dirname(fileURLToPath(import.meta.url))
const YEAR = 2025
const file = async (name, mimeType) => ({ name, mimeType, buffer: await readFile(join(HERE, 'files', name)) })

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    const lstb = async () => call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)
    const banner = page.locator('[data-testid="lstb-scan-draft-banner"]')
    const openMask = async () => {
      await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="lstb-scan-card"]').waitFor({ state: 'visible', timeout: 15_000 })
    }

    // --- Tab Belege: the original is stored, encrypted, in the inbox ------------------------------
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="belege-file-input"]').setInputFiles(await file('sap-digital.pdf', 'application/pdf'))
    const card = page.locator('[data-testid^="receipt-preview-"]').first()
    await card.waitFor({ state: 'visible', timeout: 30_000 })
    const inboxId = (await card.getAttribute('data-testid')).replace('receipt-preview-', '')
    const stored = sql(`SELECT count(*) FROM "BelegDatei" WHERE "belegId" = '${inboxId}' AND length("verschluesselteDaten") > 0`).trim()
    if (stored !== '1') fail(`the uploaded original must be stored encrypted, found ${stored} file row(s)`)
    console.log(`[${TAG}] ✅ Belege — the PDF is in the inbox, stored as cipher text`)

    // --- Eule chat: attach the LStB, the draft card shows up --------------------------------------
    // The chat works on the tax year chosen in the cockpit; the document is a 2025 one.
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.locator(`[data-testid="jahr-${YEAR}"]`).click()
    await page.getByRole('tab', { name: 'Eule' }).click()
    await page.locator('[data-testid="advisor-receipt-attach-btn"]').click()
    await page.locator('[data-testid="advisor-receipt-panel"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid="advisor-receipt-file-input"]').setInputFiles(await file('datev-digital.pdf', 'application/pdf'))
    await page.locator('[data-testid="advisor-lstb-scan-card"]').waitFor({ state: 'visible', timeout: 60_000 })
    for (const field of ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']) {
      await page.locator(`[data-testid="advisor-lstb-scan-row-${field}"]`).waitFor({ state: 'visible', timeout: 10_000 })
    }
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: the chat upload must not write the LStB')
    await page.locator('[data-testid="advisor-lstb-scan-review"]').click()
    await banner.waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[${TAG}] ✅ Eule chat — the LStB draft card shows three fields, "Maske prüfen" opens the staged mask`)
    await page.locator('[data-testid="lstb-scan-discard"]').click()
    await banner.waitFor({ state: 'detached', timeout: 15_000 })

    // --- An OCR photo: confirm field by field --------------------------------------------------------
    await openMask()
    await page.locator('[data-testid="lstb-scan-file-input"]').setInputFiles(await file('datev-foto-komprimiert.jpg', 'image/jpeg'))
    await banner.waitFor({ state: 'visible', timeout: 90_000 })
    const apply = page.locator('[data-testid="lstb-scan-apply"]')
    const confirms = page.locator('[data-testid^="lstb-confirm-field-"]')
    if ((await confirms.count()) !== 3) fail(`OCR values are never green: all three fields must ask for a check, ${await confirms.count()} do`)
    for (let left = 3; left > 0; left--) {
      if (!(await apply.isDisabled())) fail(`"Werte übernehmen" must stay locked while ${left} field(s) are unconfirmed`)
      await confirms.first().click()
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="lstb-confirm-field-"]').length < n, left, { timeout: 10_000 })
    }
    if (await apply.isDisabled()) fail('"Werte übernehmen" must unlock once every field is confirmed')
    console.log(`[${TAG}] ✅ OCR photo — three fields to confirm one by one, apply unlocks only after the last`)

    // --- Tab switch keeps the draft; reload brings it back unwritten ----------------------------------
    // The mask is a modal sheet: close it, switch to Belege and back, open the LStB tile again.
    await page.locator('[data-testid="sheet-schliessen"]').click()
    await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
    await page.getByRole('tab', { name: 'Belege' }).click()
    await page.waitForURL((u) => u.pathname === '/app/belege', { timeout: 10_000 })
    await page.getByRole('tab', { name: 'Cockpit' }).click()
    await page.locator('[data-testid="cockpit-kachel-lstb"]').click()
    await banner.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: a tab switch must not write the draft')
    console.log(`[${TAG}] ✅ tab switch — the staged draft is still there, nothing written`)
    await page.reload({ waitUntil: 'networkidle' })
    await banner.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: a reload must not write the draft')
    console.log(`[${TAG}] ✅ reload — the draft is restored from the advisor messages (#444) and still not written`)

    // Take it over, then delete the receipt behind it.
    for (let guard = 0; guard < 5 && (await confirms.count()) > 0; guard++) await confirms.first().click()
    await apply.click()
    await until(async () => (await lstb()).bruttoarbeitslohn?.value, 54_320, 'the confirmed draft must be stored', 20_000)
    const receiptId = sql(`SELECT id FROM "Beleg" WHERE "userId" = (SELECT id FROM "User" WHERE email = '${user.email}') ORDER BY "createdAt" DESC LIMIT 1`).trim()
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await page.locator(`[data-testid="receipt-delete-${receiptId}"]`).click()
    await page.locator(`[data-testid="receipt-delete-confirm-${receiptId}"]`).click()
    await page.locator(`[data-testid="receipt-preview-${receiptId}"]`).waitFor({ state: 'detached', timeout: 15_000 })
    const left = sql(`SELECT count(*) FROM "BelegDatei" WHERE "belegId" = '${receiptId}'`).trim()
    if (left !== '0') fail(`deleting the receipt must remove its encrypted file, ${left} row(s) left`)
    const fetchRes = await api.get(`/v1/belege/${receiptId}/datei`)
    if (fetchRes.ok()) fail('a deleted receipt must not be downloadable any more')
    if ((await lstb()).bruttoarbeitslohn?.value !== 54_320) fail('deleting the receipt must keep the confirmed LStB values')
    console.log(`[${TAG}] ✅ delete — the encrypted file is gone, the confirmed values stay`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 3C scan flows verified with the synthetic corpus.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
