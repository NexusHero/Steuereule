// Chat-first owl gate (#476, #479). The chat owns the screen; what used to sit beside it lives in
// the top bar and in sheets. This walks the parts no other gate touches:
//
//   A  layout: top bar, legal status, empty state, composer dock
//   B  privacy notice behind the top-bar badge
//   C  a real answer can be rated: up, down with a reason
//   D  clearing the conversation: cancel, a failed attempt, the real thing
//   E  a stored answer with everything attached: line of thought, effect of a draft in all three
//      states, "Nicht vorbereitet" with the way into the mask, the app's notice on the answer,
//      a rating that cannot be stored
//   F  a dropped connection: the chat says it is re-attaching and finishes the answer
//
// The stack is real (sign-in, session, rating, clearing). Rows E and F stub what only a model
// could produce: E replaces the stored conversation, F drops the stream on purpose.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'chat-first-layout'

const byId = (page, id) => page.locator(`[data-testid="${id}"]`)

async function see(page, id, row, timeout = 10_000) {
  await byId(page, id)
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${row}: "${id}" should be visible`))
}

async function gone(page, id, row, timeout = 10_000) {
  await byId(page, id)
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => fail(`${row}: "${id}" should be gone`))
}

async function textOf(page, id) {
  return (await byId(page, id).first().innerText()).replace(/\s+/g, ' ').trim()
}

const draft = (actionId, label, extra) => ({
  actionId,
  status: 'pending',
  screen: 'interview',
  field: `feld-${actionId}`,
  instance: null,
  label,
  previousValue: null,
  newValue: '100',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'vom Nutzer genannt',
  sourceId: 'estg-10b',
  ...extra,
})

/** What only a model could have produced, as a stored answer. */
function storedAnswer(now) {
  return [
    { id: 'stub-u1', role: 'user', content: 'Trag bitte alles ein.', meta: null, createdAt: now, status: 'complete' },
    {
      id: 'stub-a1',
      role: 'assistant',
      content: 'Ich habe die Angaben eingetragen.',
      createdAt: now,
      status: 'complete',
      reasoning: 'Der Nutzer nennt mehrere Angaben; ich lege je einen Entwurf an.',
      meta: {
        steps: ['Akte geprüft', 'Entwürfe angelegt'],
        actions: [
          draft('d1', 'Homeoffice-Tage', { effect: 'computed', beforeRefundEur: 2000, afterRefundEur: 1880, deltaEur: -120 }),
          draft('d2', 'Fortbildung', { effect: 'computed', beforeRefundEur: 2000, afterRefundEur: 2000, deltaEur: 0 }),
          draft('d3', 'Spenden', { effect: 'not-computable', effectHint: 'Wirkung erst berechenbar, wenn die Lohnsteuerbescheinigung vollständig ist.' }),
        ],
        notStaged: [{ label: 'Mieteinnahmen', reason: 'Es ist noch kein Vermietungsobjekt angelegt.', screen: 'vermietung' }],
        notices: [{ kind: 'claims-write', text: 'Die Eule trägt nichts selbst ein. Ein Wert steht erst in deiner Erklärung, wenn du einen Entwurf übernimmst.' }],
      },
    },
  ]
}

const sse = (frames) => frames.map(([id, event, data]) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const email = `chat-first-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')

    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Eule' }).click()

    // Row A — the chat is the page.
    for (const id of ['eule-topbar', 'eule-topbar-title', 'eule-legal-status', 'eule-chat-main', 'advisor-empty-state', 'advisor-chat-scroll', 'advisor-chat-composer-dock']) {
      await see(page, id, 'Row A')
    }
    const main = await byId(page, 'eule-chat-main').boundingBox()
    const viewport = page.viewportSize()
    if (!main || !viewport || main.width < viewport.width * 0.9) fail(`Row A: the chat should own the window, is ${main?.width}px of ${viewport?.width}px`)
    console.log(`[${TAG}] ✅ Row A — top bar, legal status, empty state and composer dock; the chat spans the window`)

    // Row B — the privacy notice moved behind the badge.
    await byId(page, 'eule-privacy-badge').click()
    await see(page, 'eule-privacy-sheet', 'Row B')
    if ((await textOf(page, 'eule-privacy-text')).length < 40) fail('Row B: the privacy sheet should explain what reaches the model')
    await page.keyboard.press('Escape')
    await gone(page, 'eule-privacy-text', 'Row B')
    console.log(`[${TAG}] ✅ Row B — privacy notice opens from the top bar and closes with Escape`)

    // Row C — rate a real answer.
    const input = byId(page, 'advisor-chat-input')
    await input.fill('Lohnt sich mein Arbeitsweg?')
    await input.press('Enter')
    await see(page, 'advisor-assistant-message', 'Row C', 30_000)
    await see(page, 'advisor-feedback', 'Row C')
    await byId(page, 'advisor-feedback-up').first().click()
    await see(page, 'advisor-feedback-thanks', 'Row C')
    await byId(page, 'advisor-feedback-down').first().click()
    await see(page, 'advisor-feedback-reasons', 'Row C')
    await byId(page, 'advisor-feedback-reason-unklar').first().click()
    await see(page, 'advisor-feedback-thanks', 'Row C')
    const stored = sql(`SELECT bewertung || ':' || coalesce("bewertungGrund", '') FROM "BeraterNachricht" m JOIN "User" u ON u.id = m."userId" WHERE u.email = '${email}' AND m.rolle = 'assistant'`)
    if (!String(stored).includes('down:unklar')) fail(`Row C: the rating should be stored as down/unklar, the database says "${String(stored).trim()}"`)
    console.log(`[${TAG}] ✅ Row C — thumbs up, then down with a reason; stored with the answer`)

    // Row D — clear the conversation: cancel, a failed attempt, then for real.
    await byId(page, 'eule-settings-btn').click()
    await byId(page, 'eule-clear-conversation-btn').click()
    await see(page, 'eule-clear-confirm', 'Row D')
    await byId(page, 'eule-clear-cancel-btn').click()
    await gone(page, 'eule-clear-confirm', 'Row D')
    await page.route('**/advisor/session', async (route) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await byId(page, 'eule-clear-conversation-btn').click()
    await byId(page, 'eule-clear-confirm-btn').click()
    await see(page, 'eule-clear-failed', 'Row D')
    await page.unroute('**/advisor/session')
    await byId(page, 'eule-clear-confirm-btn').click()
    await gone(page, 'eule-clear-confirm', 'Row D')
    await page.keyboard.press('Escape')
    await see(page, 'advisor-empty-state', 'Row D')
    console.log(`[${TAG}] ✅ Row D — cancel keeps the conversation, a failed clear says so, the real one empties the chat`)

    // Row E — a stored answer with everything attached.
    const now = new Date().toISOString()
    await page.route('**/advisor/session', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = storedAnswer(now)
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-thought', 'Row E', 20_000)
    if ((await byId(page, 'advisor-thought-body').count()) !== 0) fail('Row E: the line of thought of a finished answer starts collapsed')
    await byId(page, 'advisor-thought-toggle').click()
    for (const id of ['advisor-thought-body', 'advisor-thought-step', 'advisor-thought-reasoning', 'advisor-thought-note']) await see(page, id, 'Row E')
    if ((await byId(page, 'advisor-thought-step').count()) !== 2) fail('Row E: both steps of the answer should be listed')

    if ((await byId(page, 'advisor-action-card').count()) !== 3) fail(`Row E: three drafts should be three cards, found ${await byId(page, 'advisor-action-card').count()}`)
    if (!(await textOf(page, 'advisor-action-delta-negative')).includes('120')) fail('Row E: a draft that costs refund should show the computed amount')
    await see(page, 'advisor-action-effect-none', 'Row E')
    await see(page, 'advisor-action-effect-open', 'Row E')
    if (!(await textOf(page, 'advisor-action-effect-hint')).includes('Lohnsteuerbescheinigung')) fail('Row E: an open effect should say why')

    if (!(await textOf(page, 'advisor-not-staged')).includes('Mieteinnahmen')) fail('Row E: what could not be prepared should be named')
    await see(page, 'advisor-answer-notices', 'Row E')
    if (!(await textOf(page, 'advisor-answer-notice-claims-write')).includes('trägt nichts selbst ein')) fail('Row E: the app should correct the claim to have written something')

    // The stored answer does not exist on the server, so its rating cannot be saved.
    await byId(page, 'advisor-feedback-up').first().click()
    await see(page, 'advisor-feedback-failed', 'Row E')

    await byId(page, 'advisor-not-staged-open-mask').click()
    await see(page, 'eule-workbench-close', 'Row E')
    await byId(page, 'eule-workbench-close').click()
    await gone(page, 'eule-workbench-close', 'Row E')
    console.log(`[${TAG}] ✅ Row E — line of thought, three effect states, "Nicht vorbereitet" with the way into the mask, the app's notice, a rating that fails honestly`)

    // Row F — the connection drops after the answer has started.
    let resumes = 0
    await page.route('**/advisor/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          [1, 'start', { runId: 'stub-run', userMessage: null, assistantMessageId: 'stub-a2' }],
          [2, 'token', { text: 'Die Entfernungspauschale ' }],
        ]),
      }),
    )
    await page.route('**/advisor/runs/stub-run/events', async (route) => {
      resumes += 1
      // The first attempts hit an instance that is not ready; the chat keeps trying.
      if (resumes < 3) return route.fulfill({ status: 503, body: '' })
      const lastSeen = route.request().headers()['last-event-id']
      if (lastSeen !== '2') fail(`Row F: the chat should ask for the events after the last one it saw (2), asked after "${lastSeen}"`)
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          [3, 'token', { text: 'gilt für die einfache Strecke.' }],
          [4, 'done', { mode: 'langgraph', userMessage: null, assistantMessage: null }],
        ]),
      })
    })
    await input.fill('Und der Rückweg?')
    await input.press('Enter')
    await see(page, 'advisor-reconnecting', 'Row F')
    await gone(page, 'advisor-reconnecting', 'Row F', 20_000)
    if (resumes < 3) fail(`Row F: the chat should have re-attached until it got through, tried ${resumes} times`)
    console.log(`[${TAG}] ✅ Row F — a dropped stream shows "Verbindung wird wiederhergestellt", resumes after the last event and finishes`)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await ctx.close()
    console.log(`[${TAG}] PASS — chat-first layout, sheets, rating, clearing, attached notices and re-attachment verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
