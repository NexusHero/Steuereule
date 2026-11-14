// #450 5D — file uploads with `setInputFiles` and synthetic documents only:
//  * Tab Belege: upload, preview (`receipt-file-modal`), delete with confirmation;
//  * LStB scan: a text-layer PDF is read on the device, every field is confirmed one by one, nothing
//    is written before "Werte übernehmen" (Zero-Write); the overwrite dialog (confirm and cancel) and
//    the wrong-year dialog (cancel and switch year).
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf, syntheticLstbLines, TINY_PNG } from '../fixtures/synthetic-documents.mjs'

const TAG = 'uploads'
const YEAR = 2025

let browser
const pdf = async (name, lines) => ({ name, mimeType: 'application/pdf', buffer: await renderTextPdf(browser, lines) })

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    // --- Tab Belege ------------------------------------------------------------------------------
    await page.goto(`${webOrigin}/app/belege`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="belege-file-input"]').setInputFiles({ name: 'quittung-synthetisch.png', mimeType: 'image/png', buffer: TINY_PNG })
    const preview = page.locator('[data-testid^="receipt-preview-"]').first()
    await preview.waitFor({ state: 'visible', timeout: 30_000 })
    const receiptId = (await preview.getAttribute('data-testid')).replace('receipt-preview-', '')
    console.log(`[${TAG}] ✅ upload — the receipt appears in the list`)

    await preview.click()
    await page.locator('[data-testid="receipt-file-modal"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid="receipt-file-close"]').click()
    await page.locator('[data-testid="receipt-file-modal"]').waitFor({ state: 'detached', timeout: 10_000 })
    console.log(`[${TAG}] ✅ preview — opens and closes`)

    await page.locator(`[data-testid="receipt-delete-${receiptId}"]`).click()
    await page.locator(`[data-testid="receipt-delete-confirm-${receiptId}"]`).waitFor({ state: 'visible', timeout: 10_000 })
    if ((await page.locator(`[data-testid="receipt-preview-${receiptId}"]`).count()) === 0) fail('the receipt must stay until the deletion is confirmed')
    await page.locator(`[data-testid="receipt-delete-confirm-${receiptId}"]`).click()
    await page.locator(`[data-testid="receipt-preview-${receiptId}"]`).waitFor({ state: 'detached', timeout: 15_000 })
    console.log(`[${TAG}] ✅ delete — only after the confirmation`)

    // --- LStB scan ---------------------------------------------------------------------------------
    const lstb = async () => call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)
    const openLstb = async (year = YEAR) => {
      await page.goto(`${webOrigin}/app/steuerjahr/${year}/lstb`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="lstb-scan-card"]').waitFor({ state: 'visible', timeout: 15_000 })
    }
    // Fields that still need a check each carry their own confirm button; confirm one after the other.
    const confirmAllFields = async () => {
      const buttons = page.locator('[data-testid^="lstb-confirm-field-"]')
      for (let guard = 0; guard < 10 && (await buttons.count()) > 0; guard++) {
        const before = await buttons.count()
        await buttons.first().click()
        await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="lstb-confirm-field-"]').length < n, before, { timeout: 10_000 })
      }
    }
    const scan = async (file) => page.locator('[data-testid="lstb-scan-file-input"]').setInputFiles(await file)

    await openLstb()
    await scan(pdf('lstb-2025.pdf', syntheticLstbLines({ year: YEAR })))
    await page.locator('[data-testid="lstb-scan-draft-banner"]').waitFor({ state: 'visible', timeout: 60_000 }).catch(async (e) => { console.log('CARD', await page.locator('[data-testid="lstb-scan-card"]').innerText()); throw e })
    if ((await lstb()).bruttoarbeitslohn?.value) fail('Zero-Write: nothing may be stored before "Werte übernehmen"')
    console.log(`[${TAG}] ✅ scan — the draft is staged, nothing is stored yet (Zero-Write)`)

    // Confirm every field that still asks for a check, then take the values over.
    await confirmAllFields()
    await page.locator('[data-testid="lstb-scan-apply"]').click()
    await until(async () => (await lstb()).bruttoarbeitslohn?.value, 54_320, 'the applied scan must store the gross wage', 20_000)
    console.log(`[${TAG}] ✅ apply — the confirmed values are stored (gross 54.320 €)`)

    // Overwrite dialog: a second scan with other amounts meets stored values.
    await openLstb()
    await scan(pdf('lstb-2025-neu.pdf', syntheticLstbLines({ year: YEAR, gross: 60_000, wageTax: 11_000 })))
    await page.locator('[data-testid="lstb-scan-draft-banner"]').waitFor({ state: 'visible', timeout: 60_000 })
    await confirmAllFields()
    await page.locator('[data-testid="lstb-scan-apply"]').click()
    await page.locator('[data-testid="lstb-overwrite-conflict-modal"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="lstb-overwrite-cancel"]').click()
    await page.locator('[data-testid="lstb-overwrite-conflict-modal"]').waitFor({ state: 'detached', timeout: 10_000 })
    if ((await lstb()).bruttoarbeitslohn?.value !== 54_320) fail('cancelling the overwrite dialog must keep the stored values')
    console.log(`[${TAG}] ✅ lstb-overwrite-conflict-modal — cancel keeps 54.320 €`)
    await page.locator('[data-testid="lstb-scan-apply"]').click()
    await page.locator('[data-testid="lstb-overwrite-conflict-modal"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="lstb-overwrite-confirm"]').click()
    await until(async () => (await lstb()).bruttoarbeitslohn?.value, 60_000, 'confirming the overwrite must store the new gross wage', 20_000)
    console.log(`[${TAG}] ✅ lstb-overwrite-conflict-modal — confirm replaces it with 60.000 €`)

    // The same certificate once more, as a further one: refused as already recorded (fe5baaf3).
    await openLstb()
    await scan(pdf('lstb-2025-neu-nochmal.pdf', syntheticLstbLines({ year: YEAR, gross: 60_000, wageTax: 11_000 })))
    await page.locator('[data-testid="lstb-scan-draft-banner"]').waitFor({ state: 'visible', timeout: 60_000 })
    await confirmAllFields()
    await page.locator('[data-testid="lstb-scan-apply"]').click()
    await page.locator('[data-testid="lstb-overwrite-conflict-modal"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="lstb-overwrite-add"]').click()
    await page.locator('[data-testid="lstb-same-certificate"]').waitFor({ state: 'visible', timeout: 15_000 })
    if ((await lstb()).bruttoarbeitslohn?.value !== 60_000) fail('the same certificate must not be added twice')
    await page.locator('[data-testid="lstb-overwrite-cancel"]').click()
    console.log(`[${TAG}] ✅ lstb-same-certificate — the same certificate is not added twice`)

    // A further certificate whose social insurance is unreadable (ADR-0083): gross and wage tax add up,
    // the social insurance sum stands.
    const socialBefore = (await lstb()).sozialversicherung?.value
    await openLstb()
    const withoutSocial = syntheticLstbLines({ year: YEAR, gross: 900, wageTax: 300 }).filter((line) => !/^(22a|23a|25\.|26\.|27\.)/.test(line))
    await scan(pdf('lstb-2025-nachzahlung.pdf', withoutSocial))
    await page.locator('[data-testid="lstb-scan-sv-offen"]').waitFor({ state: 'visible', timeout: 60_000 })
    await confirmAllFields()
    await page.locator('[data-testid="lstb-scan-apply"]').click()
    await page.locator('[data-testid="lstb-overwrite-conflict-modal"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="lstb-overwrite-add"]').click()
    await until(async () => (await lstb()).bruttoarbeitslohn?.value, 60_900, 'adding a further certificate must add the gross wage', 20_000)
    if ((await lstb()).sozialversicherung?.value !== socialBefore) fail('an unreadable social insurance must leave the recorded sum as it is')
    console.log(`[${TAG}] ✅ lstb-scan-sv-offen / lstb-overwrite-add — a further certificate adds up, the social insurance stands`)

    // Year dialog: the document is for 2024 while 2025 is open.
    await openLstb()
    await scan(pdf('lstb-2024.pdf', syntheticLstbLines({ year: 2024 })))
    await page.locator('[data-testid="lstb-year-conflict-modal"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="lstb-year-conflict-cancel"]').click()
    await page.locator('[data-testid="lstb-year-conflict-modal"]').waitFor({ state: 'detached', timeout: 10_000 })
    console.log(`[${TAG}] ✅ lstb-year-conflict-modal — cancel stays in ${YEAR}`)
    await scan(pdf('lstb-2024.pdf', syntheticLstbLines({ year: 2024 })))
    await page.locator('[data-testid="lstb-year-conflict-switch"]').click()
    await page.waitForURL((u) => u.pathname.includes('/steuerjahr/2024/'), { timeout: 15_000 })
    console.log(`[${TAG}] ✅ lstb-year-conflict-modal — "switch year" opens 2024`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 5D receipts and LStB scan verified with synthetic documents.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
