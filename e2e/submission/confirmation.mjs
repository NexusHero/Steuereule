// #450 5B — the confirmation screen (`vorschlag-annehmen-*`, `vorschlag-verwerfen-*`, `aendern-*`,
// `anlage-*`, `bestaetige-*`) and the plausibility step (`plausibilitaet-weiter`), with a persona whose
// numbers contradict each other on purpose: 2026 already holds confirmed LStB values, the take-over
// from 2025 then proposes different ones. The gate cases (blocker / warning / re-confirm) are
// `hub-acceptance.mjs`; this file does not repeat them.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, putLstb, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'confirmation'
const YEAR = 2026

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await answer(api, 2025, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await putLstb(api, 2025, 50_000, 7_000, 10_000)
    await call(api, 'PUT', '/v1/steuerjahre/2025/kapital/kapitalertraege', { kind: 'erfasst', value: 1_500 })
    await putLstb(api, YEAR, 42_000, 5_600, 8_600)
    await call(api, 'POST', `/v1/steuerjahre/${YEAR}/uebernahme?von=2025`)
    const overview = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/bestaetigung`)
    const keys = overview.annexes.flatMap((a) => a.values.filter((v) => v.proposal !== null).map((v) => v.key))
    if (keys.length < 2) fail(`the take-over must propose at least two differing LStB values, got ${JSON.stringify(keys)}`)
    const [acceptKey, dismissKey] = keys

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/bestaetigung`, { waitUntil: 'networkidle' })
    const card = page.locator('[data-testid="anlage-anlageN"]')
    await card.waitFor({ state: 'visible', timeout: 15_000 })

    // Einzeln ändern: the button opens the mask behind the first value.
    const change = page.locator('[data-testid="aendern-anlageN"]')
    await change.click()
    await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ aendern-anlageN — opens the LStB mask`)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/bestaetigung`, { waitUntil: 'networkidle' })
    await card.waitFor({ state: 'visible', timeout: 15_000 })

    // Accept one proposal: the proposed value is written, the proposal disappears.
    const field = (key) => key.split('.')[1]
    const lstbValue = async (key) => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`))[field(key)]?.value
    const proposed = overview.annexes.flatMap((a) => a.values).find((v) => v.key === acceptKey).proposal.value
    await page.locator(`[data-testid="vorschlag-annehmen-${acceptKey}"]`).click()
    await page.locator(`[data-testid="vorschlag-annehmen-${acceptKey}"]`).waitFor({ state: 'detached', timeout: 10_000 })
    await until(async () => String(await lstbValue(acceptKey)), String(proposed), `accepting must write the proposed ${field(acceptKey)}`)
    console.log(`[${TAG}] ✅ vorschlag-annehmen — ${field(acceptKey)} became ${proposed}`)

    // Dismiss another: the confirmed value stays, the proposal disappears.
    const before = await lstbValue(dismissKey)
    await page.locator(`[data-testid="vorschlag-verwerfen-${dismissKey}"]`).click()
    await page.locator(`[data-testid="vorschlag-verwerfen-${dismissKey}"]`).waitFor({ state: 'detached', timeout: 10_000 })
    if ((await lstbValue(dismissKey)) !== before) fail('dismissing a proposal must keep the confirmed value')
    console.log(`[${TAG}] ✅ vorschlag-verwerfen — ${field(dismissKey)} kept ${before?.value ?? before}`)

    // Confirm the Anlage: `bestaetige-*` goes away once nothing is unconfirmed any more.
    const confirmBtn = page.locator('[data-testid="bestaetige-anlageKap"]')
    await confirmBtn.click()
    await confirmBtn.waitFor({ state: 'detached', timeout: 10_000 })
    console.log(`[${TAG}] ✅ bestaetige-anlageKap — the taken-over Anlage KAP is confirmed`)

    // Plausibility step: a clean persona may continue to the comparison.
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace: null })
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/plausibilitaet`, { waitUntil: 'networkidle' })
    const next = page.locator('[data-testid="plausibilitaet-weiter"]')
    await next.waitFor({ state: 'visible', timeout: 15_000 })
    await next.click()
    await page.waitForURL((u) => !u.pathname.endsWith('/plausibilitaet'), { timeout: 10_000 })
    console.log(`[${TAG}] ✅ plausibilitaet-weiter — leads on to the comparison`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 5B confirmation screen and plausibility step verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
