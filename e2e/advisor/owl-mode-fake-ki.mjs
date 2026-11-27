// Eulen-Modus gate with the fake KiPort (#450 Teil 1A and 5F, decision D8). The API runs with
// AI_FAKE_KI=1, so the Eule answers from a fixed script (apps/api/src/ki/fake-chat-model.ts) and
// this gate tests the app, not a model.
//
//   Row A — no write without a click: a draft appears, and no PUT/apply request leaves the browser.
//   Row B — apply → undo: the value in the mask is exactly the previous one again.
//   Row B2 — „Verwerfen“ on a card: nothing is written, the card says „Verworfen“, the stage drops it.
//   Row C — „Alle übernehmen“: two drafts are applied in one go.
//   Row D — stale conflict: the user changed the field after the draft → conflict banner; nothing
//           written until „Trotzdem übernehmen“.
//   Row E — „Maske ansehen“ embeds the mask inline in the Eulen-Modus.
//   Row F — tablet drawer and mobile 20 %-dock (minimise / maximise); the chat stays usable.
//   Row G — a guest sees the account prompt instead of the chat.
//   Row H — model picker and Max (ADR-0096): the picker lists the models with their cost, a pick is
//           saved for the conversation, Max goes out with one message only and says its cost.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, submitLogin } from '../harness/flows.mjs'
import { PASSWORD, createAccount, call } from '../harness/api-account.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TAG = 'owl-mode-fake-ki'
// The cockpit opens on the last completed year since UX review K2 (2025 on 2026-11-14).
const YEAR = 2025
const COMMUTE = { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 20, transport: 'pkw', workplace: null }

const commute = async (api) => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/arbeitsweg`)).inputs
const setCommute = (api, values) => call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, { ...COMMUTE, ...values })

/** What a signed-in page did, printed when a row fails: the API answers, console errors and the chat text. */
const pageTrails = new Map()
let lastSignedInPage = null

function recordTrail(page) {
  const trail = []
  pageTrails.set(page, trail)
  page.on('response', (res) => {
    const url = new URL(res.url())
    if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/')) trail.push(`${res.status()} ${res.request().method()} ${url.pathname}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') trail.push(`console.error ${msg.text().slice(0, 300)}`)
  })
  page.on('pageerror', (err) => trail.push(`pageerror ${String(err).slice(0, 300)}`))
}

async function reportTrail(page) {
  if (!page) return
  console.error(`[${TAG}] page ${page.url()}`)
  for (const line of (pageTrails.get(page) ?? []).slice(-40)) console.error(`[${TAG}]   ${line}`)
  const chat = await page.locator('[data-testid="advisor-chat-input"]').first().evaluate((el) => el.closest('main, [role="main"], body')?.innerText ?? '').catch(() => '')
  console.error(`[${TAG}] visible text (last 1500 chars):\n${chat.slice(-1500)}`)
}

async function signIn(browser, webOrigin, email, breakpoint) {
  const ctx = await newContextAtBreakpoint(browser, breakpoint)
  const page = await ctx.newPage()
  recordTrail(page)
  lastSignedInPage = page
  guardAgainst429(page, fail, '/api/auth/')
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, PASSWORD)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
  return { ctx, page }
}

const isOpeningRead = (request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/advisor/opening')
const isTurn = (request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/advisor/stream')

/**
 * What the chat of a page is doing, read off its own requests. The owl opens an empty conversation herself when
 * the case changed since her last opening (ADR-0067 §11): the app reads `/advisor/opening` and, when that says
 * `shouldOpen`, starts a turn nobody typed. While any turn streams the send button is the stop button, so a
 * message sent then is not sent. The reads, an announced opening and the running turns tell when the chat is free.
 */
const chats = new WeakMap()
function watchChat(page) {
  let chat = chats.get(page)
  if (chat) return chat
  chat = { readingOpening: 0, openingAnnouncedAt: null, turnsRunning: 0 }
  page.on('request', (request) => {
    if (isOpeningRead(request)) chat.readingOpening += 1
    if (isTurn(request)) {
      chat.turnsRunning += 1
      // Any turn settles the announcement: the opening itself, or a message that got in first (the conversation
      // is then no longer empty and the owl does not open it).
      chat.openingAnnouncedAt = null
    }
  })
  page.on('response', async (response) => {
    if (!isOpeningRead(response.request())) return
    const answer = await response.json().catch(() => null)
    if (answer?.shouldOpen === true && chat.turnsRunning === 0) chat.openingAnnouncedAt = Date.now()
    chat.readingOpening -= 1
  })
  const ended = (request) => {
    if (isTurn(request)) chat.turnsRunning -= 1
    // A read that failed gets no response event; one that got its response was counted down there.
    if (isOpeningRead(request) && request.failure() !== null) chat.readingOpening -= 1
  }
  page.on('requestfinished', ended)
  page.on('requestfailed', ended)
  chats.set(page, chat)
  return chat
}

/** Waits until the chat has decided about its opening, any opening it announced has run, and no turn is streaming. */
async function chatIsFree(page, label) {
  const chat = watchChat(page)
  const deadline = Date.now() + 30_000
  let freeSince = null
  while (Date.now() < deadline) {
    // The app opens once per conversation: a second read that says `shouldOpen` for a conversation it already
    // opened starts nothing. An announcement no turn followed within five seconds is such a read.
    if (chat.openingAnnouncedAt !== null && Date.now() - chat.openingAnnouncedAt > 5_000) chat.openingAnnouncedAt = null
    const free = chat.readingOpening === 0 && chat.openingAnnouncedAt === null && chat.turnsRunning === 0
    if (!free) freeSince = null
    else if (freeSince === null) freeSince = Date.now()
    // Free for a moment, not for an instant: the read of the opening follows the read of the session.
    else if (Date.now() - freeSince >= 500) return
    await page.waitForTimeout(50)
  }
  fail(`${label}: the chat did not become free within 30 s (opening being read: ${chat.readingOpening}, opening announced: ${chat.openingAnnouncedAt !== null}, turns streaming: ${chat.turnsRunning})`)
}

async function openEule(page) {
  watchChat(page)
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="eule-privacy-badge"]').waitFor({ state: 'visible', timeout: 15_000 })
  await chatIsFree(page, 'openEule')
}

/** Sends a message and makes sure it left the browser: a click that starts no turn fails here, by name. */
async function ask(page, text) {
  await chatIsFree(page, `ask „${text}“`)
  await page.locator('[data-testid="advisor-chat-input"]').fill(text)
  const sent = page.waitForRequest((request) => isTurn(request) && (request.postData() ?? '').includes(text), { timeout: 10_000 })
  await page.locator('[data-testid="advisor-chat-send"]').click()
  await sent.catch(() => fail(`ask: the click on send did not send „${text}“ — no turn with this text left the browser`))
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
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    for (const [questionId, value] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']]) {
      await call(user.api, 'POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId, value })
    }
    await setCommute(user.api, {})

    const { ctx, page } = await signIn(browser, webOrigin, user.email, 'l')
    await openEule(page)
    const writes = watchWrites(page)

    // Row A — a draft, but no write.
    await ask(page, 'Mein Arbeitsweg ist länger geworden, jetzt 38 km')
    const stage = page.locator('[data-testid="eule-draft-stage"]')
    await stage.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).waitFor({ state: 'visible', timeout: 10_000 })
    // UX review K3: without an LStB the real estimate cannot price the draft — the card says so instead of a figure.
    const cardId = (await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).first().getAttribute('data-testid')) ?? ''
    await page.locator(`[data-testid="draft-effect-open-${cardId.slice('draft-card-'.length)}"]`).waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(1_000)
    if (writes.length > 0) fail(`Row A: a draft must not write anything without a click, saw ${writes.join(', ')}`)
    if ((await commute(user.api)).oneWayKm !== 20) fail('Row A: the mask value changed without a click')
    console.log(`[${TAG}] ✅ Row A — draft shown, no write request without a click`)

    // Row B — apply, then undo restores the exact previous value.
    await page.locator('[data-testid="eule-batch-apply-btn"]').click()
    await until(async () => (await commute(user.api)).oneWayKm === 38, 'Row B: apply must write 38 km')
    // After „übernehmen“ the user stays in the conversation (#503); the cockpit shows the
    // „von deiner Eule übernommen“ banner once they go there.
    await page.locator('[data-testid="eulen-modus-screen"]').waitFor({ state: 'visible', timeout: 10_000 })
    // The cockpit stays mounted behind the tab: its banner is in the page, but must not be what is shown.
    if (await page.getByText('von deiner Eule übernommen').first().isVisible()) fail('Row B: applying must not jump to the cockpit')
    await page.getByRole('tab', { name: 'Cockpit' }).click()
    await page.getByText('von deiner Eule übernommen').first().waitFor({ state: 'visible', timeout: 10_000 })
    await openEule(page)
    await page.locator('[data-testid="advisor-action-undo-btn"]:visible').first().click()
    await until(async () => (await commute(user.api)).oneWayKm === 20, 'Row B: undo must restore exactly 20 km')
    const afterUndo = await commute(user.api)
    if (afterUndo.oneWayKm !== 20) fail(`Row B: undo must restore exactly 20 km, got ${afterUndo.oneWayKm}`)
    console.log(`[${TAG}] ✅ Row B — apply wrote 38 km, undo restored exactly 20 km`)

    // Row B2 — a draft the user refuses on its card: no write, the card is marked, the stage is empty again.
    await ask(page, 'Mein Arbeitsweg ist länger geworden, jetzt 38 km')
    await page.locator('[data-testid^="draft-card-"]', { hasText: '→ 38' }).first().waitFor({ state: 'visible', timeout: 15_000 })
    const writesBeforeDismiss = writes.length
    await page.locator('[data-testid="advisor-action-dismiss-btn"]:visible').last().click()
    await page.locator('[data-testid="advisor-action-dismissed-badge"]:visible').last().waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid^="draft-card-"]:visible', { hasText: '→ 38' }).waitFor({ state: 'detached', timeout: 10_000 })
    if (writes.slice(writesBeforeDismiss).some((w) => w.includes('/apply'))) fail(`Row B2: dismissing must not apply, saw ${writes.slice(writesBeforeDismiss).join(', ')}`)
    if ((await commute(user.api)).oneWayKm !== 20) fail('Row B2: a dismissed draft must leave 20 km')
    console.log(`[${TAG}] ✅ Row B2 — „Verwerfen“ wrote nothing, the card reads „Verworfen“, the stage dropped it`)

    // Row C — „Alle übernehmen“ with two drafts from two turns (the engine stages one draft per turn).
    await ask(page, 'Mein Arbeitsweg ist länger geworden, jetzt 38 km')
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
    await ask(page, 'Mein Arbeitsweg ist länger geworden, jetzt 38 km')
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
    await ask(page, 'Mein Arbeitsweg ist länger geworden, jetzt 38 km')
    const inspect = page.locator('[data-testid^="draft-inspect-"]').last()
    await inspect.waitFor({ state: 'visible', timeout: 15_000 })
    await inspect.click()
    await page.locator('[data-testid="eule-inline-mask-view"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-testid="eule-back-to-stage-btn"]').click()
    await page.locator('[data-testid="eule-inline-mask-view"]').waitFor({ state: 'hidden', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Row E — „Maske ansehen“ embeds the mask inline and returns to the drafts`)

    // Row H — the fake KI offers no models, so the list and the save are served here: this row tests the app.
    const MODELS = {
      standard: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
      models: [
        { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', depths: [{ depth: 'gruendlich', costFactor: 1, firstWordSeconds: 6, samples: 9 }, { depth: 'max', costFactor: 3, firstWordSeconds: 15, samples: 6 }] },
        { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5', depths: [{ depth: 'gruendlich', costFactor: 2, firstWordSeconds: 8, samples: 5 }, { depth: 'max', samples: 0 }] },
      ],
    }
    const picks = []
    const sent = []
    await page.route('**/advisor/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MODELS) }))
    await page.route('**/advisor/conversations/*/model', async (route) => {
      picks.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'c', title: null, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(), answering: false, chatModel: picks.at(-1) }) })
    })
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/advisor\/(?:stream|messages)$/.test(new URL(req.url()).pathname)) sent.push(req.postDataJSON())
    })
    await page.reload({ waitUntil: 'networkidle' })
    await openEule(page)
    await page.locator('[data-testid="advisor-model-picker"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="advisor-model-picker"]').click()
    await page.locator('[data-testid="advisor-model-menu"]').waitFor({ state: 'visible', timeout: 10_000 })
    const opus = page.locator('[data-testid="advisor-model-option-anthropic:claude-opus-5-5"]')
    if (!(await opus.innerText()).includes('2× Kosten')) fail('Row H: the model list should say the cost relative to the standard')
    await opus.click()
    await until(async () => picks.length === 1, 'Row H: the pick should be saved for the conversation')
    if (picks[0]?.provider !== 'anthropic' || picks[0]?.model !== 'claude-opus-5-5') fail(`Row H: wrong pick saved: ${JSON.stringify(picks[0])}`)
    await page.locator('[data-testid="advisor-depth-max"]').click()
    await page.locator('[data-testid="advisor-depth-hint"]').waitFor({ state: 'visible', timeout: 10_000 })
    const sentBefore = sent.length
    await ask(page, 'Rechne meinen Arbeitsweg bitte ganz genau nach')
    await until(async () => sent.length > sentBefore, 'Row H: the message should be sent')
    if (sent[sentBefore]?.depth !== 'max') fail(`Row H: Max should go out with the message, got ${JSON.stringify(sent[sentBefore])}`)
    await page.locator('[data-testid="advisor-chat-send"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('[data-testid="advisor-depth-hint"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => fail('Row H: Max should switch off after one message'))
    await page.unroute('**/advisor/models')
    await page.unroute('**/advisor/conversations/*/model')
    console.log(`[${TAG}] ✅ Row H — the model picker saves a pick with its cost, Max goes out with one message only`)
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
      await guest.getByText('Als Gast ansehen').click()
      await guest.getByText('Angestellt').waitFor({ state: 'visible', timeout: 10_000 })
      // The Strom's basis page (ADR-0089): every question at once, picked by test id, then Weiter.
      const pick = (id, value) => guest.locator(`[data-testid="interview-option-${id}-${value}"]`).click({ force: true })
      await pick('job', 'Angestellt')
      await pick('ausland', 'Nein')
      await pick('kinder', '2 oder mehr')
      await pick('familienstand', 'Ledig')
      await guest.locator('[data-testid="strom-weiter"]').click({ force: true })
      await guest.getByText('Später, zum Cockpit').click()
      await openEuleAsGuest(guest)
      await guest.locator('[data-testid="eule-guest-konto-wand"]').waitFor({ state: 'visible', timeout: 10_000 })
      if ((await guest.locator('[data-testid="advisor-chat-input"]').count()) > 0) fail('Row G: a guest must not get the chat')
      await ctxGuest.close()
    }
    console.log(`[${TAG}] ✅ Row G — guest sees the account prompt, no chat`)

    // Row H — an answer that arrives while the user is on another tab marks the owl in the navigation.
    {
      const away = await signIn(browser, webOrigin, user.email, 'l')
      await openEule(away.page)
      // The fake owl answers at once. The turn is held until the user has left, so the answer lands elsewhere.
      let release = () => {}
      const userIsGone = new Promise((resolve) => (release = resolve))
      await away.page.route((url) => /advisor\/(stream|runs)/.test(url.pathname), async (route) => {
        if (route.request().method() === 'POST') await userIsGone
        await route.continue()
      })
      await ask(away.page, 'Was fehlt noch?')
      await away.page.getByRole('tab', { name: 'Cockpit' }).click()
      await away.page.locator('[data-testid="cockpit-bescheid"]').waitFor({ state: 'visible', timeout: 10_000 })
      if ((await away.page.locator('[data-testid="tab-badge"]').count()) !== 0) fail('Row H: nothing waits before the answer arrived')
      release()
      const marked = away.page.getByRole('tab', { name: 'Eule, neue Antwort' })
      await marked.waitFor({ state: 'visible', timeout: 20_000 })
      if ((await marked.locator('[data-testid="tab-badge"]').count()) !== 1) fail('Row H: the marked owl entry must carry the dot')
      await marked.click()
      await away.page.locator('[data-testid="tab-badge"]').waitFor({ state: 'detached', timeout: 10_000 })
      await away.ctx.close()
    }
    console.log(`[${TAG}] ✅ Row H — an answer that arrived while the user was in the cockpit marks the owl; opening the owl reads it`)

    await user.api.dispose()
    console.log(`[${TAG}] PASS — Eulen-Modus flows with the fake KiPort verified (#450 1A, 5F).`)
  } catch (error) {
    await reportTrail(lastSignedInPage)
    throw error
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
