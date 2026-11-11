// Eulen-Modus gate with the fake KiPort (#450 Teil 1A and 5F, decision D8). The API runs with
// AI_FAKE_KI=1, so the Eule answers from a fixed script (apps/api/src/ki/fake-chat-model.ts) and
// this gate tests the app, not a model.
//
//   Row A — no write without a click: a draft appears, and no PUT/apply request leaves the browser.
//   Row B — apply → undo: the value in the mask is exactly the previous one again.
//   Row C — „Alle übernehmen“: two drafts are applied in one go.
//   Row D — stale conflict: the user changed the field after the draft → conflict banner; nothing
//           written until „Trotzdem übernehmen“.
//   Row E — „Maske ansehen“ embeds the mask inline in the Eulen-Modus.
//   Row F — tablet drawer and mobile 20 %-dock (minimise / maximise); the chat stays usable.
//   Row G — a guest sees the account prompt instead of the chat.
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'owl-mode-fake-ki'
const YEAR = 2026
const COMMUTE = { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 20, transport: 'pkw', workplace: null }

async function account(apiOrigin, webOrigin, sql) {
  const email = `owl-fake-${Date.now()}@beispiel.de`
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

const commute = async (api) => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/arbeitsweg`)).inputs
const setCommute = (api, values) => call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { ...COMMUTE, ...values })

async function signIn(browser, webOrigin, email, breakpoint) {
  const ctx = await newContextAtBreakpoint(browser, breakpoint)
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
  await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
  return { ctx, page }
}

async function openEule(page) {
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="eule-privacy-badge"]').waitFor({ state: 'visible', timeout: 15_000 })
}

async function ask(page, text) {
  await page.locator('[data-testid="advisor-chat-input"]').fill(text)
  await page.locator('[data-testid="advisor-chat-send"]').click()
}

/** Every request that could write tax data: the mask PUTs and the advisor apply/undo calls. */
function watchWrites(page) {
  const writes = []
  page.on('request', (req) => {
    const url = req.url()
    if (req.method() !== 'GET' && (url.endsWith('/arbeitsweg') || /\/advisor\/actions\//.test(url))) writes.push(`${req.method()} ${url}`)
  })
  return writes
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await account(apiOrigin, webOrigin, sql)
    for (const [questionId, value] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']]) {
      await call(user.api, 'POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId, value })
    }
    await setCommute(user.api, {})

    const { ctx, page } = await signIn(browser, webOrigin, user.email, 'l')
    await openEule(page)
    const writes = watchWrites(page)

    // Row A — a draft, but no write.
    await ask(page, 'Mein Arbeitsweg ist länger geworden')
    const stage = page.locator('[data-testid="eule-draft-stage"]')
    await stage.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(1_000)
    if (writes.length > 0) fail(`Row A: a draft must not write anything without a click, saw ${writes.join(', ')}`)
    if ((await commute(user.api)).oneWayKm !== 20) fail('Row A: the mask value changed without a click')
    console.log(`[${TAG}] ✅ Row A — draft shown, no write request without a click`)

    // Row B — apply, then undo restores the exact previous value.
    await page.locator('[data-testid="eule-batch-apply-btn"]').click()
    await until(async () => (await commute(user.api)).oneWayKm === 38, 'Row B: apply must write 38 km')
    // After „übernehmen“ the app returns to the cockpit with the „von deiner Eule übernommen“ banner.
    await page.getByText('von deiner Eule übernommen').first().waitFor({ state: 'visible', timeout: 10_000 })
    await openEule(page)
    await page.locator('[data-testid="advisor-action-undo-btn"]:visible').first().click()
    await until(async () => (await commute(user.api)).oneWayKm === 20, 'Row B: undo must restore exactly 20 km')
    const afterUndo = await commute(user.api)
    if (afterUndo.oneWayKm !== 20) fail(`Row B: undo must restore exactly 20 km, got ${afterUndo.oneWayKm}`)
    console.log(`[${TAG}] ✅ Row B — apply wrote 38 km, undo restored exactly 20 km`)

    // Row C — „Alle übernehmen“ with two drafts from two turns (the engine stages one draft per turn).
    await ask(page, 'Mein Arbeitsweg ist länger geworden')
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).first().waitFor({ state: 'visible', timeout: 15_000 })
    await ask(page, 'Ich war oft im Homeoffice')
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 60' }).first().waitFor({ state: 'visible', timeout: 15_000 })
    if ((await page.locator('[data-testid^="draft-card-"]:visible').count()) !== 2) fail('Row C: expected two drafts in the stage')
    await page.locator('[data-testid="eule-batch-apply-btn"]').click()
    await until(async () => {
      const both = await commute(user.api)
      return both.oneWayKm === 38 && both.homeOfficeDays === 60
    }, 'Row C: both drafts must be applied')
    await openEule(page)
    console.log(`[${TAG}] ✅ Row C — „Alle übernehmen“ applied both drafts`)

    // Row D — the user changes the field after the draft: conflict, then „Trotzdem übernehmen“.
    await setCommute(user.api, {})
    await page.reload({ waitUntil: 'networkidle' })
    await openEule(page)
    await ask(page, 'Mein Arbeitsweg ist länger geworden')
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).last().waitFor({ state: 'visible', timeout: 15_000 })
    await setCommute(user.api, { oneWayKm: 25 })
    await page.locator('[data-testid="eule-batch-apply-btn"]').click()
    await page.locator('[data-testid="eule-stale-conflict-banner"]').waitFor({ state: 'visible', timeout: 10_000 })
    if ((await commute(user.api)).oneWayKm !== 25) fail('Row D: a stale draft must not overwrite the newer value')
    await page.locator('[data-testid="eule-force-apply-btn"]').click()
    await until(async () => (await commute(user.api)).oneWayKm === 38, 'Row D: „Trotzdem übernehmen“ must apply the draft')
    await openEule(page)
    console.log(`[${TAG}] ✅ Row D — conflict banner kept 25 km, „Trotzdem übernehmen“ wrote 38 km`)

    // Row E — „Maske ansehen“ shows the mask inline.
    await setCommute(user.api, {})
    await ask(page, 'Mein Arbeitsweg ist länger geworden')
    const inspect = page.locator('[data-testid^="draft-inspect-"]').last()
    await inspect.waitFor({ state: 'visible', timeout: 15_000 })
    await inspect.click()
    await page.locator('[data-testid="eule-inline-mask-view"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid="eule-back-to-stage-btn"]').click()
    await page.locator('[data-testid="eule-inline-mask-view"]').waitFor({ state: 'hidden', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Row E — „Maske ansehen“ embeds the mask inline and returns to the drafts`)
    await ctx.close()

    // Row F — tablet and phone: the chat is the screen and answers; the workbench is a sheet that
    // opens from the title bar and never covers the chat unasked (#476).
    for (const bp of ['m', 's']) {
      const narrow = await signIn(browser, webOrigin, user.email, bp)
      await openEule(narrow.page)
      await ask(narrow.page, 'Hallo Eule')
      await narrow.page.locator('[data-testid="advisor-assistant-message"]', { hasText: 'Test-Eule' }).last().waitFor({ state: 'visible', timeout: 15_000 })
      if (await narrow.page.locator('[data-testid="eule-workbench-sheet"]').isVisible().catch(() => false)) {
        fail(`Row F (${bp}): the workbench must not cover the chat by itself`)
      }
      await narrow.page.locator('[data-testid="eule-hints-pill"]').click()
      await narrow.page.locator('[data-testid="eule-workbench-sheet"]').waitFor({ state: 'visible', timeout: 10_000 })
      await narrow.page.locator('[data-testid="eule-hints-pill"]').click({ force: true }).catch(() => {})
      await narrow.ctx.close()
    }
    console.log(`[${TAG}] ✅ Row F — tablet and phone: the chat answers, the workbench opens as a sheet on request`)

    // Row G — a guest gets the account prompt.
    {
      const ctxGuest = await newContextAtBreakpoint(browser, 'l')
      const guest = await ctxGuest.newPage()
      await skipSplash(guest, webOrigin)
      await guest.getByText('Erstmal als Gast umschauen').click()
      await guest.getByText('Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
      await guest.getByText('Angestellt').click()
      await guest.getByText('Nein').click({ force: true })
      await guest.getByText('2 oder mehr').click({ force: true })
      await guest.getByText('Ledig').click({ force: true })
      await guest.getByText('Später — erst mal ins Cockpit').click()
      await openEuleAsGuest(guest)
      await guest.locator('[data-testid="eule-guest-konto-wand"]').waitFor({ state: 'visible', timeout: 10_000 })
      if ((await guest.locator('[data-testid="advisor-chat-input"]').count()) > 0) fail('Row G: a guest must not get the chat')
      await ctxGuest.close()
    }
    console.log(`[${TAG}] ✅ Row G — guest sees the account prompt, no chat`)

    await user.api.dispose()
    console.log(`[${TAG}] PASS — Eulen-Modus flows with the fake KiPort verified (#450 1A, 5F).`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

/** Polls a condition on the real API (the chat may render the badge in a hidden pane). */
async function until(check, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(message)
}

async function openEuleAsGuest(page) {
  await page.getByRole('tab', { name: 'Eule' }).click()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
