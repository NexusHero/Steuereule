// #443 acceptance criteria without an E2E so far (#450 Teil 4): AC 1 (no data loss on tab switch),
// AC 6 (submission gate: blocker locks, warnings need one confirmation, a new warning again) and
// AC 7 (closing a sheet saves the typed amount without leaving the field).
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'hub-acceptance'
const YEAR = 2026
const COMMUTE = { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace: null }

async function account(apiOrigin, webOrigin, sql) {
  const email = `hub-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`sign-in failed (${res.status()})`)
  return { email, api }
}

async function call(api, method, path, data) {
  const res = await api.fetch(path, { method, ...(data === undefined ? {} : { data }) })
  if (!res.ok()) fail(`${method} ${path} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function answer(api, pairs) {
  for (const [questionId, value] of pairs) await call(api, 'POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId, value })
}

async function lstb(api, gross, wageTax, social) {
  for (const [field, value] of [['bruttoarbeitslohn', gross], ['lohnsteuer', wageTax], ['sozialversicherung', social]]) {
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/${field}`, { kind: 'erfasst', value })
  }
}

async function isEnabled(locator) {
  return locator.evaluate((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true')
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await account(apiOrigin, webOrigin, sql)
    await answer(user.api, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
    await call(user.api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, COMMUTE)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(user.email)
    await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })

    // AC 6a — a blocker (no LStB yet) locks the printout and leads to it.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/abgabe`, { waitUntil: 'networkidle' })
    const toPrintout = page.locator('[data-testid="abgabe-zum-ausdruck"]')
    await toPrintout.waitFor({ state: 'visible', timeout: 15_000 })
    if (await isEnabled(toPrintout)) fail('AC 6: with an open LStB the printout must be locked')
    await page.locator('[data-testid="abgabe-kachel-lstb"]').click()
    await page.waitForURL((u) => u.pathname === `/app/steuerjahr/${YEAR}/lstb`, { timeout: 10_000 })
    console.log(`[${TAG}] ✅ AC 6 — blocker locks the printout and leads to the LStB`)

    // AC 6b — a warning („Betrag später“) needs one confirmation; a new kind of warning needs another.
    await lstb(user.api, 42_000, 5_600, 8_600)
    await answer(user.api, [['dhf', 'Nein'], ['umzug', 'Ja'], ['umzug-kosten', 'spaeter'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein'], ['nebenjob', 'Nein']])
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/abgabe`, { waitUntil: 'networkidle' })
    const confirm = page.locator('[data-testid="gate-warnung-bestaetigen"]')
    await confirm.waitFor({ state: 'visible', timeout: 15_000 })
    if (await isEnabled(toPrintout)) fail('AC 6: an unconfirmed warning must lock the printout')
    await confirm.click()
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="abgabe-zum-ausdruck"]')
      return el !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
    }, null, { timeout: 10_000 })
    // A new warning: Werbungskosten above the wage (a small wage with a long way to work).
    await lstb(user.api, 2_000, 0, 0)
    await call(user.api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { ...COMMUTE, oneWayKm: 60 })
    await page.reload({ waitUntil: 'networkidle' })
    await confirm.waitFor({ state: 'visible', timeout: 15_000 })
    if (await isEnabled(toPrintout)) fail('AC 6: a new warning must lock the printout again until it is confirmed')
    await confirm.click()
    console.log(`[${TAG}] ✅ AC 6 — warnings unlock after one confirmation; a new warning locks again`)

    // AC 7 — closing a sheet saves the amount typed without leaving the field: LStB, a catalog
    // amount and the Arbeitstage form (the last two lost it before #450 Teil 4).
    const until = async (read, expected, message) => {
      const deadline = Date.now() + 10_000
      let value = null
      while (Date.now() < deadline) {
        value = await read()
        if (value === expected) return
        await page.waitForTimeout(250)
      }
      fail(`${message}, stored ${JSON.stringify(value)}`)
    }
    const typeAndClose = async (tile, field, text) => {
      await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
      await page.locator(`[data-testid="cockpit-kachel-${tile}"]`).click()
      const input = page.locator(`[data-testid="${field}"]`)
      await input.waitFor({ state: 'visible', timeout: 10_000 })
      await input.fill(text)
      await page.locator('[data-testid="sheet-schliessen"]').click()
      await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })
    }
    await typeAndClose('lstb', 'lstb-bruttoarbeitslohn', '2100')
    await until(async () => (await call(user.api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).bruttoarbeitslohn?.value, 2100, 'AC 7: LStB sheet must save 2.100 €')
    await typeAndClose('arbeitsweg', 'arbeitstage-km', '33')
    await until(async () => (await call(user.api, 'GET', `/v1/steuerjahre/${YEAR}/arbeitsweg`)).inputs?.oneWayKm, 33, 'AC 7: Arbeitstage sheet must save 33 km')
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="cockpit-kachel-sonderausgaben"]').click()
    await page.locator('[data-testid="katalog-option-spenden-Ja"]').click()
    const donation = page.locator('[data-testid="katalog-input-spenden-betrag"]')
    await donation.waitFor({ state: 'visible', timeout: 10_000 })
    await donation.fill('250')
    await page.locator('[data-testid="sheet-schliessen"]').click()
    await until(async () => (await call(user.api, 'GET', `/v1/steuerjahre/${YEAR}/interview`)).answers?.['spenden-betrag'], '250', 'AC 7: catalog sheet must save 250 €')
    console.log(`[${TAG}] ✅ AC 7 — LStB (2.100 €), Arbeitstage (33 km) and a catalog amount (250 €) survive closing the sheet`)

    // 375 px: the tax-year chips stay inside the screen.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="jahr-2026"]').waitFor({ state: 'visible', timeout: 10_000 })
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="jahr-"]')].map((el) => el.getBoundingClientRect().right).filter((right) => right > window.innerWidth + 0.5),
    )
    if (overflow.length > 0) fail(`375 px: ${overflow.length} tax-year chips reach past the right edge`)
    await page.setViewportSize({ width: 1280, height: 800 })
    console.log(`[${TAG}] ✅ 375 px — every tax-year chip stays inside the screen`)

    // AC 1 — typed input and scroll position survive a tab switch (a full-screen mask: the sheets are
    // modal, the tab bar is not reachable while one is open).
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/stammdaten`, { waitUntil: 'networkidle' })
    const job = page.locator('[data-testid="stammdaten-beruf"]')
    await job.waitFor({ state: 'visible', timeout: 15_000 })
    await job.fill('Gärtnerin')
    const plz = page.locator('[data-testid="stammdaten-plz"]')
    await plz.scrollIntoViewIfNeeded()
    const scrollTop = () => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('*')].map((el) => el.scrollTop)))
    const scrollBefore = await scrollTop()
    await page.getByRole('tab', { name: 'Belege' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: 'Cockpit' }).click()
    await job.waitFor({ state: 'visible', timeout: 10_000 })
    if ((await job.inputValue()) !== 'Gärtnerin') fail(`AC 1: the typed value must survive the tab switch, got ${await job.inputValue()}`)
    const scrollAfter = await scrollTop()
    if (Math.abs(scrollAfter - scrollBefore) > 4) fail(`AC 1: the scroll position must be restored (${scrollBefore} → ${scrollAfter})`)
    console.log(`[${TAG}] ✅ AC 1 — typed value and scroll position survive Cockpit → Belege → Cockpit`)

    await ctx.close()
    await user.api.dispose()
    console.log(`[${TAG}] PASS — #443 AC 1, AC 6, AC 7 and the 375 px year chips verified in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
