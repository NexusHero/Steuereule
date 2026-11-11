// #450 5H — every way to dismiss a sheet: the close button, a click on the backdrop, Escape and a
// drag on the grabber. Each way must also keep the typed amount (#443 AC 7: closing saves it).
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'sheet-dismissal'
const YEAR = 2026

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    let ctx = await newContextAtBreakpoint(browser, 'l')
    let page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    const stored = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).bruttoarbeitslohn?.value
    const open = async (amount) => {
      await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="cockpit-kachel-lstb"]').click()
      const input = page.locator('[data-testid="lstb-bruttoarbeitslohn"]')
      await input.waitFor({ state: 'visible', timeout: 10_000 })
      await input.fill(String(amount))
    }
    const closed = () => page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

    await open(1_111)
    await page.locator('[data-testid="sheet-schliessen"]').click()
    await closed()
    await until(stored, 1_111, 'the close button must save the typed amount')
    console.log(`[${TAG}] ✅ close button — closes and saves 1.111 €`)

    await open(2_222)
    const backdrop = await page.locator('[data-testid="sheet-backdrop"]').boundingBox()
    if (backdrop === null) fail('the backdrop must be visible while the sheet is open')
    await page.mouse.click(backdrop.x + 6, backdrop.y + 6)
    await closed()
    await until(stored, 2_222, 'a click on the backdrop must save the typed amount')
    console.log(`[${TAG}] ✅ backdrop — a click beside the sheet closes it and saves 2.222 €`)

    await open(3_333)
    await page.keyboard.press('Escape')
    await closed()
    await until(stored, 3_333, 'Escape must save the typed amount')
    console.log(`[${TAG}] ✅ Escape — closes the sheet from inside the field and saves 3.333 €`)

    // The grabber only exists on a phone-sized screen (the sheet is a bottom sheet there).
    await open(4_000)
    if ((await page.locator('[data-testid="sheet-grabber"]').count()) !== 0) fail('1280 px: a centred dialog has no grabber')
    await page.keyboard.press('Escape')
    await closed()
    await ctx.close()
    ctx = await newContextAtBreakpoint(browser, 's')
    page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    await open(4_444)
    const grabber = await page.locator('[data-testid="sheet-grabber"]').boundingBox()
    if (grabber === null) fail('the grabber must be visible while the sheet is open')
    const x = grabber.x + grabber.width / 2
    const y = grabber.y + grabber.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let step = 1; step <= 12; step++) await page.mouse.move(x, y + step * 25)
    await page.mouse.up()
    await closed()
    await until(stored, 4_444, 'dragging the grabber down must save the typed amount')
    console.log(`[${TAG}] ✅ grabber — a drag down closes the sheet and saves 4.444 €`)

    // A short drag only springs back: the sheet stays open.
    await open(5_555)
    const g2 = await page.locator('[data-testid="sheet-grabber"]').boundingBox()
    await page.mouse.move(g2.x + g2.width / 2, g2.y + 4)
    await page.mouse.down()
    await page.mouse.move(g2.x + g2.width / 2, g2.y + 20, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    if ((await page.locator('[data-testid="sheet-schliessen"]').count()) === 0) fail('a short drag on the grabber must leave the sheet open')
    console.log(`[${TAG}] ✅ grabber — a short drag springs back and keeps the sheet open`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 5H sheet dismissal verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
