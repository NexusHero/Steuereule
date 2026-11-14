// #450 5E — time and failure states.
//  * Fristen-Banner: `abgelaufen` for real (tax year 2025: its Abgabefrist 31.07.2026 is past for good),
//    `warnung` and `keine` through a stubbed `/fristen` answer. The deadline is computed on the
//    SERVER (Berlin date), so a browser clock — `page.clock.setFixedTime()` — cannot move it; the
//    stub is the deterministic way to reach the 60-day window.
//  * Failure states: a 500 on one endpoint, and the network going away, through `page.route()` and
//    `context.setOffline()`. Checked: the honest error state with "Erneut versuchen", the
//    "Speichern fehlgeschlagen" notice, and that nothing typed is lost.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, putLstb, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'errors'
const YEAR = 2026

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await answer(api, 2025, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await putLstb(api, YEAR, 42_000, 5_600, 8_600)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    // --- Fristen-Banner -------------------------------------------------------------------------
    const cors = { 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true' }
    const stubDeadline = (level, remainingDays) =>
      page.route(/\/v1\/steuerjahre\/\d+\/fristen$/, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              status: 200,
              headers: cors,
              contentType: 'application/json',
              body: JSON.stringify({
                filingDeadline: '2027-08-02',
                today: '2027-06-03',
                level,
                remainingDays,
                lateFilingSurcharge: { minimumRateEur: 25, percentPerMonth: 0.25 },
              }),
            })
          : route.continue(),
      )
    const banner = (level) => page.locator(`[data-testid="fristen-banner-${level}"]`)
    const openCockpit = async (year) => {
      await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await page.locator(`[data-testid="jahr-${year}"]`).click()
      await page.locator('[data-testid="cockpit-interview"], [data-testid="cockpit-weiter"], [data-testid="cockpit-kachel-lstb"]').first().waitFor({ state: 'visible', timeout: 15_000 })
    }

    // H5: 2025 is a plain single employee too — a voluntary return: a calm note even though the
    // Abgabefrist 31.07.2026 is past, never the surcharge alarm.
    await openCockpit(2025)
    await banner('freiwillig').waitFor({ state: 'visible', timeout: 10_000 })
    if ((await banner('abgelaufen').count()) + (await banner('zuschlag').count()) !== 0) fail('no surcharge alarm for a voluntary return')
    console.log(`[${TAG}] ✅ fristen-banner-freiwillig — tax year 2025 (Abgabefrist 31.07.2026 is past), voluntary return`)

    // H5: YEAR is a plain single employee — a voluntary return, so the near deadline stays calm.
    await stubDeadline('warnung', 60)
    await openCockpit(YEAR)
    await banner('freiwillig').waitFor({ state: 'visible', timeout: 10_000 })
    if ((await banner('warnung').count()) !== 0) fail('a voluntary return must not get the deadline warning')
    console.log(`[${TAG}] ✅ fristen-banner-freiwillig — 60 days before the Abgabefrist, voluntary return`)

    await page.unroute(/\/v1\/steuerjahre\/\d+\/fristen$/)
    await stubDeadline('keine', 200)
    await openCockpit(YEAR)
    if ((await page.locator('[data-testid^="fristen-banner-"]').count()) !== 0) fail('level "keine" must show no banner at all')
    await page.unroute(/\/v1\/steuerjahre\/\d+\/fristen$/)
    console.log(`[${TAG}] ✅ no banner when the Abgabefrist is far away`)

    // --- K2: the running year is a „prepare“ mode, said up front, not at the end -----------------
    await openCockpit(YEAR)
    await page.locator('[data-testid="cockpit-laufendes-jahr"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid="cockpit-abgabe-laufendes-jahr"]').waitFor({ state: 'attached', timeout: 10_000 })
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/abgabe`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="abgabe-laufendes-jahr"]').waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ the running year ${YEAR} says in the cockpit and at the submission that it cannot be filed yet`)

    // K2: „Anderes Jahr“ under the first question switches the year without leaving the interview.
    await page.goto(`${webOrigin}/app/steuerjahr/2024/interview`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="interview-anderes-jahr"]').click()
    await page.locator('[data-testid="interview-jahr-2023"]').click()
    await page.waitForURL((u) => u.pathname.includes('/steuerjahr/2023/'), { timeout: 10_000 })
    await page.locator('[data-testid="interview-option-job-Angestellt"]').waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ „Anderes Jahr“ switches the interview from 2024 to 2023`)

    // --- Interview: the answer POST fails, the step stays, a retry goes through ------------------
    await answer(api, YEAR, [['job', 'Angestellt']]) // keep the gate open; the next question is asked below
    const interview = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)
    const unanswered = ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob'].find((q) => interview.answers?.[q] === undefined)
    if (unanswered === undefined) fail('the persona must still have an unanswered life-situation question')
    const failAnswers = (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue())
    await page.route(/\/interview\/antworten$/, failAnswers)
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/katalog/lebenslagen`, { waitUntil: 'networkidle' })
    const option = page.locator(`[data-testid="katalog-option-${unanswered}-Nein"]`)
    await option.waitFor({ state: 'visible', timeout: 15_000 })
    await option.click()
    await page.locator('[data-testid="katalog-option-' + unanswered + '-Nein"]').waitFor({ state: 'visible', timeout: 5_000 })
    await page.waitForTimeout(800)
    const stored = (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)).answers?.[unanswered]
    if (stored !== undefined) fail(`a failed POST must not store the answer, got ${stored}`)
    console.log(`[${TAG}] ✅ interview answer POST 500 — nothing stored, the question stays on screen`)
    await page.unroute(/\/interview\/antworten$/)
    await option.click()
    await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)).answers?.[unanswered], 'Nein', 'the retry must store the answer', 15_000)
    console.log(`[${TAG}] ✅ …and the same click goes through once the endpoint answers again`)

    // --- LStB: load error with "Erneut versuchen" ------------------------------------------------
    await page.route(/\/v1\/steuerjahre\/\d+\/lstb(\?.*)?$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue()))
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="fehler-zustand"]').waitFor({ state: 'visible', timeout: 30_000 })
    // Unroute only after the click was issued: the app may also refetch on its own (focus), which
    // would remove the button between the check and the click — either way the mask must come back.
    const retryButton = page.locator('[data-testid="fehler-erneut-versuchen"]')
    await retryButton.waitFor({ state: 'visible', timeout: 10_000 })
    await page.unroute(/\/v1\/steuerjahre\/\d+\/lstb(\?.*)?$/)
    await retryButton.click({ timeout: 4_000 }).catch(() => {})
    await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[${TAG}] ✅ LStB GET 500 — error state, "Erneut versuchen" brings the mask back`)

    // --- LStB: the save fails (500, then offline); the typed value stays --------------------------
    const gross = page.locator('[data-testid="lstb-bruttoarbeitslohn"]')
    const notice = page.locator('[data-testid="speichern-fehlgeschlagen"]')
    await page.route(/\/v1\/steuerjahre\/\d+\/lstb\/bruttoarbeitslohn(\?.*)?$/, (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue()))
    const leave = () => page.locator('[data-testid="lstb-weiter"]').click()
    await gross.fill('51000')
    await gross.blur()
    await leave() // a failed save keeps the user on the mask once and says so (usePendingMutations)
    await notice.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await gross.inputValue()).replace(/\D/g, '') !== '51000') fail('the typed amount must stay in the field after a failed save')
    console.log(`[${TAG}] ✅ LStB PUT 500 — "Speichern fehlgeschlagen" and the typed amount stays`)
    await page.unroute(/\/v1\/steuerjahre\/\d+\/lstb\/bruttoarbeitslohn(\?.*)?$/)

    // A second press of "Weiter" leaves anyway, so start the offline case on a fresh mask.
    await page.reload({ waitUntil: 'networkidle' })
    await gross.waitFor({ state: 'visible', timeout: 15_000 })
    await gross.fill('52000')
    await ctx.setOffline(true)
    await gross.blur()
    await leave()
    await notice.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await gross.inputValue()).replace(/\D/g, '') !== '52000') fail('offline: the typed amount must stay in the field')
    await ctx.setOffline(false)
    await gross.fill('53000')
    await gross.blur()
    await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).bruttoarbeitslohn?.value, 53_000, 'back online the amount must be saved', 15_000)
    console.log(`[${TAG}] ✅ offline — failure is shown, nothing lost, saved once the network is back`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — #450 5E deadline banners and failure states verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
