// Church tax gate (#450 Teil 6F, ADR-0063): the six personas of the 6F table on the real stack.
// Accounts are set up through the API with their own session cookies; the cockpit hint and the
// Zeile 6 input are checked in a real browser.
//
//   Row 1 — Ledig, Berlin, evangelisch: 9 %, the LStB church tax (typed in the LStB mask) is credited.
//   Row 2 — Ledig, München, katholisch: 8 %.
//   Row 3 — Ehepaar, ein Ehegatte konfessionslos: church tax only on the member's share (or Kirchgeld).
//   Row 4 — Ehepaar mit Kindern, beide Mitglied: measured after the child allowances, Kindergeld wins.
//   Row 5 — Konfessionslos: church tax 0, no hint in the cockpit.
//   Row 6 — Konfession leer: honest "offen" in the cockpit, never a silent 0 €.
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'church-tax'
const YEAR = 2026

async function account(apiOrigin, webOrigin, sql, label) {
  const email = `church-${label}-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`${label}: sign-in failed (${res.status()})`)
  return { email, api }
}

async function call(api, method, path, data) {
  const res = await api.fetch(path, { method, ...(data === undefined ? {} : { data }) })
  if (!res.ok()) fail(`${method} ${path} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Interview answers one after another (409 ANSWER_UNREACHABLE otherwise). */
async function interview(api, answers) {
  for (const [questionId, value] of answers) await call(api, 'POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId, value })
}

async function lstb(api, gross, wageTax, social, churchTax) {
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: gross })
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/lohnsteuer`, { kind: 'erfasst', value: wageTax })
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/sozialversicherung`, { kind: 'erfasst', value: social })
  if (churchTax !== undefined) await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb-kirchensteuer`, { kirchensteuer: churchTax, kirchensteuerEhegatte: null })
}

async function masterData(api, values) {
  const religion = values.religion ?? null
  await call(api, 'PUT', '/v1/stammdaten', { ...values, religion, ...(religion ? { religionConsent: true } : {}) })
}

const estimate = (api) => call(api, 'GET', `/v1/steuerjahre/${YEAR}/steuerschaetzung`)

function expectRange(label, status) {
  if (status.kind !== 'spanne') fail(`${label}: expected an estimate, got ${JSON.stringify(status).slice(0, 200)}`)
  return status
}

async function signInBrowser(browser, webOrigin, email) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, PASSWORD)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
  return { ctx, page }
}

async function cockpitText(page, webOrigin) {
  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  const refund = page.locator('[data-testid="cockpit-erstattung"]')
  await refund.waitFor({ state: 'visible', timeout: 15_000 })
  return {
    refund: await refund.innerText(),
    churchOpen: (await page.locator('[data-testid="cockpit-kirchensteuer-offen"]').count()) > 0
      ? await page.locator('[data-testid="cockpit-kirchensteuer-offen"]').innerText()
      : null,
  }
}

const SINGLE = [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']]

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    // Row 1 — Berlin, evangelisch; Zeile 6 is typed into the LStB mask in the browser.
    const lena = await account(apiOrigin, webOrigin, sql, 'berlin')
    await interview(lena.api, SINGLE)
    await masterData(lena.api, { familienstand: 'ledig', religion: 'EV', plz: '10115', wohnort: 'Berlin' })
    await lstb(lena.api, 52_000, 8_200, 10_600)
    {
      const { ctx, page } = await signInBrowser(browser, webOrigin, lena.email)
      const before = await cockpitText(page, webOrigin)
      if (!before.churchOpen?.includes('Zeile 6')) fail(`Row 1: without Zeile 6 the cockpit must say what is missing, got ${before.churchOpen}`)
      await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
      const line6 = page.locator('[data-testid="lstb-kirchensteuer"]')
      await line6.waitFor({ state: 'visible', timeout: 15_000 })
      const saved = page.waitForResponse((r) => r.url().includes('/lstb-kirchensteuer') && r.request().method() === 'PUT' && r.ok(), { timeout: 10_000 })
      await line6.fill('738')
      await line6.press('Tab')
      await saved
      const after = await cockpitText(page, webOrigin)
      if (after.churchOpen !== null) fail(`Row 1: with Zeile 6 the church tax is part of the estimate, but the cockpit says: ${after.churchOpen}`)
      if (!after.refund.includes('Erstattung')) fail(`Row 1: expected a refund, got ${after.refund}`)
      await ctx.close()
    }
    const r1 = expectRange('Row 1', await estimate(lena.api))
    if (r1.churchTax?.kind !== 'spanne') fail(`Row 1: expected church tax, got ${JSON.stringify(r1.churchTax)}`)
    if (r1.churchTax.withheld !== 738) fail(`Row 1: withheld must be 738, got ${r1.churchTax.withheld}`)
    if (r1.churchTax.due.to !== Math.floor(r1.incomeTax.to * 0.09)) fail(`Row 1: 9 % expected, got ${r1.churchTax.due.to} on ${r1.incomeTax.to}`)
    if (r1.specialExpenses < 738) fail('Row 1: the church tax paid must count as Sonderausgabe')
    console.log(`[${TAG}] ✅ Row 1 — Berlin ev.: 9 % (${r1.churchTax.due.from}–${r1.churchTax.due.to} €), 738 € credited, refund in the cockpit`)

    // Row 2 — München, katholisch.
    const max = await account(apiOrigin, webOrigin, sql, 'muenchen')
    await interview(max.api, SINGLE)
    await masterData(max.api, { familienstand: 'ledig', religion: 'RK', plz: '80331', wohnort: 'München' })
    await lstb(max.api, 52_000, 8_200, 10_600, 656)
    const r2 = expectRange('Row 2', await estimate(max.api))
    if (r2.churchTax?.kind !== 'spanne' || r2.churchTax.due.to !== Math.floor(r2.incomeTax.to * 0.08)) {
      fail(`Row 2: 8 % expected, got ${JSON.stringify(r2.churchTax)} on ${r2.incomeTax.to}`)
    }
    console.log(`[${TAG}] ✅ Row 2 — München kath.: 8 % (${r2.churchTax.due.to} €)`)

    // Row 3 — couple in Dresden, only A is a member (glaubensverschieden).
    const anna = await account(apiOrigin, webOrigin, sql, 'anna')
    const ben = await account(apiOrigin, webOrigin, sql, 'ben')
    await interview(anna.api, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet']])
    await masterData(anna.api, { familienstand: 'verheiratet', religion: 'EV', plz: '01067', wohnort: 'Dresden' })
    await lstb(anna.api, 30_000, 2_100, 6_100, 0)
    const link = await call(anna.api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })
    await call(ben.api, 'POST', `/v1/steuerjahre/${YEAR}/kopplung/beitreten/${link.invitationCode}`)
    await interview(ben.api, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']])
    await masterData(ben.api, { familienstand: 'verheiratet', religion: 'VD', plz: '01067', wohnort: 'Dresden' })
    await lstb(ben.api, 110_000, 30_000, 19_000)
    const r3 = expectRange('Row 3', await estimate(anna.api))
    if (r3.churchTax?.kind !== 'spanne') fail(`Row 3: expected church tax, got ${JSON.stringify(r3.churchTax)}`)
    const fullRate = Math.floor(r3.incomeTax.to * 0.09)
    if (!(r3.churchTax.due.to > 0 && r3.churchTax.due.to < fullRate)) fail(`Row 3: only the member's share (or Kirchgeld), got ${r3.churchTax.due.to} vs ${fullRate} for both`)
    console.log(`[${TAG}] ✅ Row 3 — glaubensverschieden: ${r3.churchTax.due.to} € instead of ${fullRate} € on the whole joint tax`)

    // Row 4 — couple with two children, both members, Kindergeld wins.
    const carla = await account(apiOrigin, webOrigin, sql, 'carla')
    const dirk = await account(apiOrigin, webOrigin, sql, 'dirk')
    await interview(carla.api, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', '2 oder mehr'], ['familienstand', 'Verheiratet']])
    await masterData(carla.api, { familienstand: 'verheiratet', religion: 'RK', plz: '10115', wohnort: 'Berlin' })
    await lstb(carla.api, 32_000, 1_900, 6_500, 171)
    await call(carla.api, 'POST', `/v1/steuerjahre/${YEAR}/kinder`, { firstName: 'Ida', lastName: 'Kern', geburtsdatum: '2018-04-02', kinship: '1' })
    await call(carla.api, 'POST', `/v1/steuerjahre/${YEAR}/kinder`, { firstName: 'Ole', lastName: 'Kern', geburtsdatum: '2021-09-14', kinship: '1' })
    const link4 = await call(carla.api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })
    await call(dirk.api, 'POST', `/v1/steuerjahre/${YEAR}/kopplung/beitreten/${link4.invitationCode}`)
    await interview(dirk.api, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', '2 oder mehr']])
    await masterData(dirk.api, { familienstand: 'verheiratet', religion: 'EV', plz: '10115', wohnort: 'Berlin' })
    await lstb(dirk.api, 20_000, 600, 4_100, 54)
    const r4 = expectRange('Row 4', await estimate(carla.api))
    if (r4.churchTax?.kind !== 'spanne') fail(`Row 4: expected church tax, got ${JSON.stringify(r4.churchTax)}`)
    if (r4.churchTax.withheld !== 171 + 54) fail(`Row 4: both LStB lines credited, got ${r4.churchTax.withheld}`)
    if (!(r4.churchTax.due.to < Math.floor(r4.incomeTax.to * 0.09))) fail(`Row 4: § 51a — measured after the child allowances, got ${r4.churchTax.due.to} on ${r4.incomeTax.to}`)
    console.log(`[${TAG}] ✅ Row 4 — two children: ${r4.churchTax.due.to} € after the Kinderfreibeträge (9 % of the tax would be ${Math.floor(r4.incomeTax.to * 0.09)} €)`)

    // Row 5 — no church: nothing, and no hint.
    const emil = await account(apiOrigin, webOrigin, sql, 'ohne')
    await interview(emil.api, SINGLE)
    await masterData(emil.api, { familienstand: 'ledig', religion: 'VD', plz: '10115', wohnort: 'Berlin' })
    await lstb(emil.api, 52_000, 8_200, 10_600)
    const r5 = expectRange('Row 5', await estimate(emil.api))
    if (r5.churchTax?.kind !== 'none') fail(`Row 5: expected no church tax, got ${JSON.stringify(r5.churchTax)}`)
    {
      const { ctx, page } = await signInBrowser(browser, webOrigin, emil.email)
      const shown = await cockpitText(page, webOrigin)
      if (shown.churchOpen !== null) fail(`Row 5: no church — no hint, got ${shown.churchOpen}`)
      await ctx.close()
    }
    console.log(`[${TAG}] ✅ Row 5 — konfessionslos: no church tax, no hint`)

    // Row 6 — confession not entered: honest "offen".
    const frida = await account(apiOrigin, webOrigin, sql, 'leer')
    await interview(frida.api, SINGLE)
    await lstb(frida.api, 52_000, 8_200, 10_600)
    const r6 = expectRange('Row 6', await estimate(frida.api))
    if (r6.churchTax?.kind !== 'offen' || r6.churchTax.reason !== 'konfession-fehlt') fail(`Row 6: expected "offen", got ${JSON.stringify(r6.churchTax)}`)
    {
      const { ctx, page } = await signInBrowser(browser, webOrigin, frida.email)
      const shown = await cockpitText(page, webOrigin)
      if (!shown.churchOpen?.includes('Konfession')) fail(`Row 6: the cockpit must ask for the confession, got ${shown.churchOpen}`)
      await ctx.close()
    }
    console.log(`[${TAG}] ✅ Row 6 — Konfession leer: "offen", never 0 €`)

    for (const a of [lena, max, anna, ben, carla, dirk, emil, frida]) await a.api.dispose()
    console.log(`[${TAG}] PASS — the six church tax personas of #450 Teil 6F verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
