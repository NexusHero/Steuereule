// Chat-first owl gate (#476, #479). The chat owns the screen; what used to sit beside it lives in
// the top bar and in sheets. This walks the parts no other gate touches:
//
//   A  layout: top bar, legal status under the chat, empty state with the composer in the middle,
//      a sidebar that holds conversations only
//   B  privacy notice behind the top-bar badge
//   C  a real answer can be rated: up, down with a reason
//   D  clearing the conversation: cancel, a failed attempt, the real thing
//   E  a stored answer with everything attached: line of thought, effect of a draft in all three
//      states, "Nicht vorbereitet" with the way into the mask, the app's notice on the answer,
//      a rating that cannot be stored
//      (E also: an answer of the fixed rules names why the model did not answer)
//   F  a dropped connection: the chat says it is re-attaching and finishes the answer
//   G  several conversations in one tax year: new, own messages each, rename, switch, search in a
//      dialog (also Ctrl+K), delete
//   H  the notes of the tax year, behind the situation chip in the composer: add, change, delete
//   I  the context ring: fill level, no summary of a short conversation
//   K  the latest answer came from the rules: "try again" asks the same question in place of that turn
//   L  the connection status in the top bar: connected, model unreachable, server unreachable
//   M  Turbo: off at first, sends the flag, an answer the owl applied itself says so
//   J  on a phone the conversations open as a drawer from the left
//
// The stack is real (sign-in, session, rating, clearing). Rows E and F stub what only a model
// could produce: E replaces the stored conversation, F drops the stream on purpose.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

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
    { id: 'stub-u0', role: 'user', content: 'Frage, auf die das Modell nicht antwortete', meta: null, createdAt: now, status: 'complete' },
    {
      id: 'stub-a0',
      role: 'assistant',
      content: 'Ich habe deine Akte im Blick.',
      createdAt: now,
      status: 'complete',
      meta: { modelFailure: { reason: 'quota', detail: 'Gemini · HTTP 429' } },
    },
    { id: 'stub-u1', role: 'user', content: 'Trag bitte alles ein.', meta: null, createdAt: now, status: 'complete' },
    {
      id: 'stub-a1',
      role: 'assistant',
      content: 'Ich habe die Angaben eingetragen.',
      createdAt: now,
      status: 'complete',
      reasoning: 'Der Nutzer nennt mehrere Angaben; ich lege je einen Entwurf an.',
      durationMs: 8200,
      meta: {
        thoughtSteps: [
          { kind: 'status', label: 'Akte geprüft' },
          { kind: 'tool', tool: 'stage_field_draft', label: 'Bereite sicheren Entwurf vor …', result: 'fertig · −120 € Erstattung', ok: true },
        ],
        actions: [
          draft('d1', 'Homeoffice-Tage', { effect: 'computed', beforeRefundEur: 2000, afterRefundEur: 1880, deltaEur: -120 }),
          draft('d2', 'Fortbildung', { effect: 'computed', beforeRefundEur: 2000, afterRefundEur: 2000, deltaEur: 0 }),
          draft('d3', 'Spenden', { effect: 'not-computable', effectHint: 'Wirkung erst berechenbar, wenn die Lohnsteuerbescheinigung vollständig ist.' }),
        ],
        notStaged: [{ label: 'Mieteinnahmen', reason: 'Es ist noch kein Vermietungsobjekt angelegt.', screen: 'vermietung' }],
        notices: [{ kind: 'claims-write', text: 'Die Eule trägt nichts selbst ein. Ein Wert steht erst in deiner Erklärung, wenn du einen Entwurf übernimmst.' }],
        noteChanges: [
          { kind: 'added', noteId: 'stub-note', text: 'Arbeitszimmer geprüft: lohnt sich nicht.' },
          { kind: 'removed', text: 'Gilt nicht mehr.', undone: true },
        ],
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
    await submitLogin(page, email, TEST_PASSWORD)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Eule' }).click()

    // Row A — the chat is the page.
    for (const id of ['eule-topbar', 'eule-topbar-title', 'eule-legal-status', 'eule-chat-main', 'advisor-empty-state', 'advisor-chat-scroll', 'advisor-chat-composer-dock']) {
      await see(page, id, 'Row A')
    }
    // The project sidebar (#481) starts open beside the chat; collapsed, the chat owns the window,
    // and the choice survives a reload.
    const viewport = page.viewportSize()
    const chatWidth = async () => (await byId(page, 'eule-chat-main').boundingBox())?.width ?? 0
    await see(page, 'eule-project-sidebar', 'Row A')
    await see(page, 'eule-conversations', 'Row A')
    if (!viewport || (await chatWidth()) < viewport.width * 0.6) fail(`Row A: beside the sidebar the chat should still be the main area, is ${await chatWidth()}px of ${viewport?.width}px`)
    await byId(page, 'eule-conversations-btn').click()
    await gone(page, 'eule-project-sidebar', 'Row A')
    if ((await chatWidth()) < viewport.width * 0.9) fail(`Row A: with the sidebar collapsed the chat should own the window, is ${await chatWidth()}px of ${viewport.width}px`)
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'eule-chat-main', 'Row A', 20_000)
    if ((await byId(page, 'eule-project-sidebar').count()) !== 0) fail('Row A: a collapsed sidebar should stay collapsed after a reload')
    await byId(page, 'eule-conversations-btn').click()
    await see(page, 'eule-project-sidebar', 'Row A')
    // Chat-first: the legal status sits under the chat, not in the top bar; the sidebar holds
    // conversations only; the situation and the notes wait behind a chip in the composer.
    if ((await textOf(page, 'eule-topbar')).includes('Rechtsstand')) fail('Row A: the legal status belongs under the chat, not in the top bar')
    for (const id of ['eule-situation', 'eule-notes', 'eule-conversation-search']) {
      if ((await byId(page, 'eule-project-sidebar').locator(`[data-testid="${id}"]`).count()) !== 0) fail(`Row A: "${id}" should not sit in the sidebar`)
    }
    await see(page, 'eule-conversation-search-open', 'Row A')
    await see(page, 'eule-situation-chip', 'Row A')
    console.log(`[${TAG}] ✅ Row A — top bar, legal status under the chat, empty state, composer; sidebar open beside the chat with conversations only, collapsed it stays collapsed`)

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
    // Down is stored at once, the reason follows in a second request: wait for that one to be answered.
    const reasonStored = page.waitForResponse((res) => res.url().includes('/feedback') && res.request().method() === 'PUT' && (res.request().postData() ?? '').includes('unklar'), { timeout: 15_000 })
    await byId(page, 'advisor-feedback-reason-unklar').first().click()
    await reasonStored.catch(() => fail('Row C: choosing a reason should store it'))
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
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await byId(page, 'eule-clear-conversation-btn').click()
    await byId(page, 'eule-clear-confirm-btn').click()
    await see(page, 'eule-clear-failed', 'Row D')
    await page.unroute('**/advisor/session*')
    await byId(page, 'eule-clear-confirm-btn').click()
    await gone(page, 'eule-clear-confirm', 'Row D')
    await page.keyboard.press('Escape')
    await see(page, 'advisor-empty-state', 'Row D')
    console.log(`[${TAG}] ✅ Row D — cancel keeps the conversation, a failed clear says so, the real one empties the chat`)

    // Row G — several conversations in one tax year (#481): each has its own messages. On this
    // width the list lives in the sidebar.
    const ask = async (text) => {
      const before = await byId(page, 'advisor-assistant-message').count()
      await input.fill(text)
      await input.press('Enter')
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="advisor-assistant-message"]').length > n, before, { timeout: 30_000 }).catch(() => fail(`Row G: no answer to "${text}"`))
      await see(page, 'advisor-chat-send', 'Row G', 15_000)
    }
    const chatText = async () => (await byId(page, 'advisor-chat-scroll').innerText()).replace(/\s+/g, ' ')
    const rows = () => byId(page, 'eule-conversation-row')
    const rowCountIs = (n, why) => page.waitForFunction((count) => document.querySelectorAll('[data-testid="eule-conversation-row"]').length === count, n, { timeout: 10_000 }).catch(() => fail(`Row G: ${why}`))
    await ask('Frage zum Arbeitsweg')
    await page.waitForFunction(() => document.querySelector('[data-testid="eule-conversation-row"]')?.textContent?.includes('Frage zum Arbeitsweg'), null, { timeout: 10_000 }).catch(() => fail('Row G: a conversation should be named after its first question'))
    await byId(page, 'eule-conversation-new').click()
    await see(page, 'advisor-empty-state', 'Row G')
    await ask('Frage zur Vermietung')
    if ((await chatText()).includes('Frage zum Arbeitsweg')) fail('Row G: a new conversation must not show the messages of the other one')
    await rowCountIs(2, 'two conversations expected in the list')

    // The one used last comes first and is the open one; rename it from its "…".
    await byId(page, 'eule-conversation-menu').first().click()
    await byId(page, 'eule-conversation-rename').first().click()
    await byId(page, 'eule-conversation-rename-input').fill('Meine Wohnung')
    await byId(page, 'eule-conversation-rename-save').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="eule-conversation-row"]')?.textContent?.includes('Meine Wohnung'), null, { timeout: 10_000 }).catch(() => fail('Row G: the new name should show in the list'))

    // Open the other one: its own messages are back.
    await byId(page, 'eule-conversation-open').nth(1).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="advisor-chat-scroll"]')?.textContent?.includes('Frage zum Arbeitsweg'), null, { timeout: 10_000 }).catch(() => fail('Row G: opening the first conversation should show its messages'))
    if ((await chatText()).includes('Frage zur Vermietung')) fail('Row G: the first conversation must not show the messages of the second')

    // Search over the conversations of the year, in a dialog behind the magnifier: Escape closes it,
    // Ctrl+K opens it; nothing found, a failed search, and a hit in the other conversation that opens it.
    await byId(page, 'eule-conversation-search-open').click()
    await see(page, 'eule-search-sheet', 'Row G')
    await page.keyboard.press('Escape')
    await gone(page, 'eule-search-sheet', 'Row G')
    await page.keyboard.press('Control+k')
    await see(page, 'eule-search-sheet', 'Row G')
    await see(page, 'eule-conversation-search-dialog', 'Row G')
    const search = byId(page, 'eule-conversation-search')
    await search.fill('gewerbesteuer')
    await see(page, 'eule-conversation-search-results', 'Row G')
    await see(page, 'eule-conversation-search-empty', 'Row G')
    await page.route('**/advisor/search*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' }))
    await search.fill('vermietung')
    await see(page, 'eule-conversation-search-failed', 'Row G')
    await page.unroute('**/advisor/search*')
    await search.fill('zur vermiet')
    await see(page, 'eule-conversation-search-hit', 'Row G')
    if (!(await textOf(page, 'eule-conversation-search-hit')).includes('Frage zur Vermietung')) fail('Row G: the hit should show the passage that was found')
    await byId(page, 'eule-conversation-search-hit').first().click()
    await page.waitForFunction(() => document.querySelector('[data-testid="advisor-chat-scroll"]')?.textContent?.includes('Frage zur Vermietung'), null, { timeout: 10_000 }).catch(() => fail('Row G: a hit should open its conversation'))
    await gone(page, 'eule-search-sheet', 'Row G')
    await rowCountIs(2, 'the list of conversations stays as it was')

    // Delete the other one: a second, explicit step, and it can be cancelled. A failed delete says so.
    const other = page.locator('[data-testid="eule-conversation-row"]', { hasText: 'Meine Wohnung' })
    const deleteOther = async () => {
      await other.locator('[data-testid="eule-conversation-menu"]').click()
      await other.locator('[data-testid="eule-conversation-delete"]').click()
    }
    await deleteOther()
    await byId(page, 'eule-conversation-delete-cancel').click()
    if ((await rows().count()) !== 2) fail('Row G: cancelling must keep the conversation')
    await page.route('**/advisor/conversations/*', async (route) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await deleteOther()
    await byId(page, 'eule-conversation-delete-confirm').click()
    await see(page, 'eule-conversation-failed', 'Row G')
    await page.unroute('**/advisor/conversations/*')
    await deleteOther()
    await byId(page, 'eule-conversation-delete-confirm').click()
    await rowCountIs(1, 'the deleted conversation should leave the list')
    const left = sql(`SELECT count(*) FROM "BeraterGespraech" g JOIN "User" u ON u.id = g."userId" WHERE u.email = '${email}'`)
    if (String(left).trim() !== '1') fail(`Row G: one conversation should be left in the database, found ${String(left).trim()}`)
    console.log(`[${TAG}] ✅ Row G — new conversation, own messages each, named after the first question, rename, switch, search, delete after a second step`)

    // Row H — the notes of the tax year, behind the situation chip in the composer: add, change, delete by hand.
    await byId(page, 'eule-situation-chip').click()
    await see(page, 'eule-situation-sheet', 'Row H')
    await see(page, 'eule-notes', 'Row H')
    await see(page, 'eule-notes-empty', 'Row H')
    await byId(page, 'eule-note-add').click()
    await byId(page, 'eule-note-cancel').click()
    await gone(page, 'eule-note-input', 'Row H')
    await byId(page, 'eule-note-add').click()
    await byId(page, 'eule-note-input').fill('Fahrtenbuch reiche ich nach.')
    await byId(page, 'eule-note-save').click()
    await see(page, 'eule-note-row', 'Row H')
    if (!(await textOf(page, 'eule-note-row')).includes('Fahrtenbuch reiche ich nach.')) fail('Row H: the new note should be listed')
    await byId(page, 'eule-note-edit').click()
    await byId(page, 'eule-note-input').fill('Fahrtenbuch ist nachgereicht.')
    await byId(page, 'eule-note-save').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="eule-note-row"]')?.textContent?.includes('ist nachgereicht'), null, { timeout: 10_000 }).catch(() => fail('Row H: the changed text should show'))
    const storedNotes = sql(`SELECT count(*) FROM "BeraterNotiz" n JOIN "User" u ON u.id = n."userId" WHERE u.email = '${email}'`)
    if (String(storedNotes).trim() !== '1') fail(`Row H: the note should be stored once, found ${String(storedNotes).trim()}`)
    await page.route('**/advisor/notes/*', async (route) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await byId(page, 'eule-note-delete').click()
    await see(page, 'eule-note-failed', 'Row H')
    await page.unroute('**/advisor/notes/*')
    await byId(page, 'eule-note-delete').click()
    await see(page, 'eule-notes-empty', 'Row H')
    console.log(`[${TAG}] ✅ Row H — a note added, changed and deleted by hand; a failed delete says so`)

    // Row U — "Unsere Situation" (#501): the household in the user's own words, in the same dialog.
    // A failed save says so; a stored text is there after a reload, once, for the user and not the year.
    await see(page, 'eule-situation', 'Row U')
    await page.route('**/advisor/situation', async (route) => {
      if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await byId(page, 'eule-situation-input').fill('Verheiratet, zwei Kinder. Hauskauf für 2027 geplant.')
    await byId(page, 'eule-situation-save').click()
    await see(page, 'eule-situation-failed', 'Row U')
    await page.unroute('**/advisor/situation')
    await byId(page, 'eule-situation-save').click()
    await see(page, 'eule-situation-saved', 'Row U')
    const storedSituations = sql(`SELECT count(*) FROM "BeraterSituation" s JOIN "User" u ON u.id = s."userId" WHERE u.email = '${email}'`)
    if (String(storedSituations).trim() !== '1') fail(`Row U: the situation should be stored once, found ${String(storedSituations).trim()}`)
    await page.keyboard.press('Escape')
    await gone(page, 'eule-situation-sheet', 'Row U')
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'eule-situation-chip', 'Row U', 20_000)
    if (!(await textOf(page, 'eule-situation-chip')).includes('Verheiratet, zwei Kinder.')) fail('Row U: the chip should name the stored situation')
    await byId(page, 'eule-situation-chip').click()
    await see(page, 'eule-situation-input', 'Row U')
    if ((await byId(page, 'eule-situation-input').inputValue()) !== 'Verheiratet, zwei Kinder. Hauskauf für 2027 geplant.') fail('Row U: the stored situation should be there after a reload')
    await page.keyboard.press('Escape')
    await gone(page, 'eule-situation-sheet', 'Row U')
    console.log(`[${TAG}] ✅ Row U — the situation is stored once, survives a reload, and a failed save says so`)

    // Row R — the line between the list and the chat can be dragged (#503): the list gets wider, the
    // chat gives way, and the width is remembered.
    await see(page, 'eule-resize-sidebar', 'Row R')
    const widthOf = async (id) => (await byId(page, id).boundingBox())?.width ?? 0
    const sidebarBefore = await widthOf('eule-project-sidebar')
    const grip = await byId(page, 'eule-resize-sidebar').boundingBox()
    if (grip === null) fail('Row R: the line next to the list should be there to grab')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 + 90, grip.y + grip.height / 2, { steps: 6 })
    await page.mouse.up()
    const sidebarAfter = await widthOf('eule-project-sidebar')
    if (Math.abs(sidebarAfter - sidebarBefore - 90) > 12) fail(`Row R: dragging the line 90px should widen the list by about that, went from ${sidebarBefore} to ${sidebarAfter}`)
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'eule-project-sidebar', 'Row R', 20_000)
    if (Math.abs((await widthOf('eule-project-sidebar')) - sidebarAfter) > 2) fail('Row R: the dragged width should be remembered after a reload')
    console.log(`[${TAG}] ✅ Row R — the list is resized by dragging its line, and the width is remembered`)

    // Row I — the context ring in the composer: says how full the conversation is; too short to summarise.
    await byId(page, 'advisor-context-ring').click()
    await see(page, 'advisor-context-popover', 'Row I')
    if (!/\d+ %/.test(await textOf(page, 'advisor-context-percent'))) fail('Row I: the ring should name how full the context is')
    if (!(await byId(page, 'advisor-context-summarize').isDisabled())) fail('Row I: a short conversation offers no summary yet')
    await byId(page, 'advisor-context-ring').click()
    await gone(page, 'advisor-context-popover', 'Row I')
    console.log(`[${TAG}] ✅ Row I — the context ring names the fill level and offers no summary of a short conversation`)

    // Row E — a stored answer with everything attached.
    const now = new Date().toISOString()
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = storedAnswer(now)
      // The first message is already summarised: the dividing line sits after it.
      json.context = { usedTokens: 5200, maxTokens: 6000, percent: 87, level: 'warn', canSummarize: true, summary: '- Nutzer wollte mehrere Angaben eintragen', summarizedUntilMessageId: 'stub-u1' }
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-thought', 'Row E', 20_000)
    // Drafts are waiting: the bulb in the top bar counts them.
    await see(page, 'eule-hints-count', 'Row E')
    // Drafts open the workbench at the side; its line can be grabbed too.
    await see(page, 'eule-resize-workbench', 'Row E')
    if ((await byId(page, 'advisor-thought-body').count()) !== 0) fail('Row E: the line of thought of a finished answer starts collapsed')
    if (!(await textOf(page, 'advisor-thought-toggle')).includes('Nachgedacht · 8 s · 2 Schritte')) fail(`Row E: the line should say how long and how many steps, reads "${await textOf(page, 'advisor-thought-toggle')}"`)
    await byId(page, 'advisor-thought-toggle').click()
    for (const id of ['advisor-thought-body', 'advisor-thought-step', 'advisor-thought-result', 'advisor-thought-reasoning', 'advisor-thought-note']) await see(page, id, 'Row E')
    if ((await byId(page, 'advisor-thought-step').count()) !== 2) fail('Row E: both steps of the answer should be listed')
    if (!(await textOf(page, 'advisor-thought-result')).includes('fertig')) fail('Row E: a tool step should say what it found')

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

    // An answer from the fixed rules says why the model did not answer, and what failed technically (#487).
    await see(page, 'advisor-model-failure', 'Row E')
    const failureText = await textOf(page, 'advisor-model-failure-text')
    if (!failureText.includes('Kontingent') || !failureText.includes('festen Regeln')) fail(`Row E: the answer of the rules should say why the model did not answer, says "${failureText}"`)
    if (!(await textOf(page, 'advisor-model-failure-detail')).includes('HTTP 429')) fail('Row E: the technical detail should be shown')

    // What the owl noted in this answer, with a way back; the stored answer is a stub, so undo fails honestly.
    await see(page, 'advisor-note-changes', 'Row E')
    if ((await byId(page, 'advisor-note-change').count()) !== 2) fail('Row E: both note changes of the answer should be shown')
    if (!(await textOf(page, 'advisor-note-change')).includes('Gemerkt: Arbeitszimmer geprüft')) fail('Row E: the answer should say what the owl noted')
    await see(page, 'advisor-note-change-undone', 'Row E')
    await byId(page, 'advisor-note-change-undo').click()
    await see(page, 'advisor-note-change-failed', 'Row E')

    // The summarised part ends at a dividing line; the summary opens on request. An almost full
    // context offers "Jetzt zusammenfassen"; on the real, short conversation that fails honestly.
    await see(page, 'advisor-summary-divider', 'Row E')
    await byId(page, 'advisor-summary-toggle').click()
    if (!(await textOf(page, 'advisor-summary-text')).includes('mehrere Angaben')) fail('Row E: the dividing line should open the summary')
    await byId(page, 'advisor-context-ring').click()
    if (!(await textOf(page, 'advisor-context-percent')).includes('87 %')) fail('Row E: the ring should show the fill level of the conversation')
    await byId(page, 'advisor-context-summarize').click()
    await see(page, 'advisor-context-failed', 'Row E')
    await byId(page, 'advisor-context-ring').click()

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

    // Row K — the latest answer came from the rules because the model was overloaded: "try again"
    // asks the same question in place of that turn (#487).
    await page.unroute('**/advisor/session*')
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = [
        { id: 'stub-uk', role: 'user', content: 'Lohnt sich ein Fahrtenbuch?', meta: null, createdAt: now, status: 'complete' },
        { id: 'stub-ak', role: 'assistant', content: 'Ich habe deine Akte im Blick.', createdAt: now, status: 'complete', meta: { modelFailure: { reason: 'unavailable', detail: 'Gemini · HTTP 503' } } },
      ]
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-model-failure-retry', 'Row K', 20_000)
    const retried = page.waitForRequest((req) => req.url().includes('/advisor/stream') && req.method() === 'POST', { timeout: 10_000 })
    await byId(page, 'advisor-model-failure-retry').click()
    const sentBody = JSON.parse((await retried).postData() ?? '{}')
    if (sentBody.message !== 'Lohnt sich ein Fahrtenbuch?' || sentBody.replaceFromMessageId !== 'stub-uk') fail(`Row K: retry should ask the same question in place of the turn, sent ${JSON.stringify(sentBody)}`)
    console.log(`[${TAG}] ✅ Row K — "Noch einmal mit dem Sprachmodell versuchen" asks the same question again in place of the rule-based turn`)

    // Row L — the status of the connection (#488): a dot and a word in the top bar, details on a tap,
    // and it tells the model being unreachable from the server being unreachable.
    await page.unroute('**/advisor/session*')
    await page.route('**/advisor/connection', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'connected', provider: 'Gemini', model: 'gemini-test', checkedAt: new Date().toISOString() }) }))
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'eule-connection-chip', 'Row L', 20_000)
    await see(page, 'eule-connection-dot-ok', 'Row L')
    if ((await textOf(page, 'eule-connection-label')) !== 'Verbunden · Gemini') fail(`Row L: connected should read "Verbunden · Gemini", reads "${await textOf(page, 'eule-connection-label')}"`)
    await byId(page, 'eule-connection-chip').click()
    await see(page, 'eule-connection-sheet', 'Row L')
    await see(page, 'eule-connection-details', 'Row L')
    if (!(await textOf(page, 'eule-connection-model')).includes('gemini-test')) fail('Row L: the details should name the model')

    // The model stops answering: a new check says why, in words.
    await page.unroute('**/advisor/connection')
    await page.route('**/advisor/connection', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'unavailable', provider: 'Gemini', model: 'gemini-test', failure: { reason: 'quota', detail: 'Gemini · HTTP 429' }, checkedAt: new Date().toISOString() }) }))
    await byId(page, 'eule-connection-recheck').click()
    await see(page, 'eule-connection-dot-bad', 'Row L')
    if (!(await textOf(page, 'eule-connection-failure')).includes('Kontingent')) fail('Row L: the details should give the reason the model is unreachable')
    if ((await textOf(page, 'eule-connection-label')) !== 'Sprachmodell nicht erreichbar') fail('Row L: the chip should say the model is unreachable')

    // The server stops answering at all: that is another sentence.
    await page.unroute('**/advisor/connection')
    await page.route('**/advisor/connection', (route) => route.abort('connectionrefused'))
    await byId(page, 'eule-connection-recheck').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="eule-connection-label"]')?.textContent === 'Keine Verbindung zum Server', null, { timeout: 15_000 }).catch(() => fail('Row L: an unreachable server should read "Keine Verbindung zum Server"'))
    await page.keyboard.press('Escape')
    console.log(`[${TAG}] ✅ Row L — connection status: connected, model unreachable with its reason, server unreachable`)
    await page.unroute('**/advisor/connection')

    // Row M — Turbo (#491): off at first; on, the message carries the flag; an answer the owl applied
    // itself says so and shows what it applied.
    await page.unroute('**/advisor/session*')
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      const applied = { actionId: 'turbo-1', status: 'applied', screen: 'interview', field: 'spenden-betrag', instance: null, label: 'Spenden', previousValue: '100', newValue: '300', beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'Stub', sourceId: 'estg-10b', appliedAt: now }
      json.messages = [
        { id: 'turbo-u1', role: 'user', content: 'Bitte 300 € Spenden eintragen', meta: null, createdAt: now, status: 'complete', feedback: null },
        { id: 'turbo-a1', role: 'assistant', content: 'Erledigt.', meta: { action: applied, turbo: true }, createdAt: now, status: 'complete', feedback: null },
      ]
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-turbo-summary', 'Row M', 20_000)
    if (!(await textOf(page, 'advisor-turbo-summary')).includes('1 Änderung direkt übernommen')) fail('Row M: the answer should say how many changes the owl applied')
    await see(page, 'advisor-composer-switches', 'Row M')
    const toggle = byId(page, 'advisor-turbo-toggle')
    if ((await toggle.getAttribute('aria-checked')) !== 'false') fail('Row M: Turbo must start off')
    await toggle.click()
    if ((await toggle.getAttribute('aria-checked')) !== 'true') fail('Row M: the switch should turn Turbo on')
    const sent = page.waitForRequest((request) => request.method() === 'POST' && /advisor\/(stream|runs)/.test(request.url()) && (request.postData() ?? '').includes('"turbo":true'), { timeout: 15_000 })
    await byId(page, 'advisor-chat-input').fill('Danke')
    await byId(page, 'advisor-chat-send').click()
    await sent.catch(() => fail('Row M: with Turbo on, the message should carry turbo:true'))
    console.log(`[${TAG}] ✅ Row M — Turbo: off at first, flag on send, the applied answer says so`)

    // Row S — skills (#495): off at first, listed, switchable; a round of questions has answers to
    // tap, needs every question answered, and goes out as one message with the skill attached.
    await page.unroute('**/advisor/session*')
    const roundNow = new Date().toISOString()
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = [
        { id: 'round-u1', role: 'user', content: 'Fang an', meta: null, createdAt: roundNow, status: 'complete', feedback: null },
        { id: 'round-a1', role: 'assistant', content: 'Erste Runde:', meta: { situationSuggestions: ['Elternzeit ab März 2027.'], questionRound: { questions: [{ text: 'Sollen wir die Fortbildungskosten ansetzen?', kind: 'decision', options: ['Ja', 'Nein'], recommended: 'Ja', reason: 'Sie senken die Steuer.' }, { text: 'Gab es einen Umzug?', kind: 'fact', options: ['Ja', 'Nein'] }] } }, createdAt: roundNow, status: 'complete', feedback: null },
      ]
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-question-round', 'Row S', 20_000)

    // What the owl would add to "Unsere Situation": nothing is stored without a tap, a failed one says so.
    await see(page, 'advisor-situation-suggestions', 'Row S')
    if (!(await textOf(page, 'advisor-situation-suggestion')).includes('Elternzeit ab März 2027.')) fail('Row S: the suggestion should be shown under the answer')
    await page.route('**/advisor/situation', async (route) => {
      if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL"}' })
      else await route.fallback()
    })
    await byId(page, 'advisor-situation-suggestion-accept').click()
    await see(page, 'advisor-situation-suggestion-failed', 'Row S')
    await page.unroute('**/advisor/situation')
    await byId(page, 'advisor-situation-suggestion-accept').click()
    await see(page, 'advisor-situation-suggestion-taken', 'Row S')
    if ((await byId(page, 'advisor-question').count()) !== 2) fail('Row S: both questions of the round should be shown')
    if (!(await textOf(page, 'advisor-question-round')).includes('Empfohlen')) fail('Row S: the owl’s pick should be marked')
    if (!(await byId(page, 'advisor-question-submit').isDisabled())) fail('Row S: a round with open questions must not be sendable')
    await byId(page, 'advisor-question-take-recommended').click()
    await byId(page, 'advisor-question-option').nth(3).click()
    await byId(page, 'advisor-skills-toggle').click()
    await see(page, 'advisor-skills-panel', 'Row S')
    await byId(page, 'advisor-skill-berater-interview').click()
    if ((await textOf(page, 'advisor-skills-toggle')) !== 'Berater-Interview') fail('Row S: the switched-on skill should name itself')
    const roundSent = page.waitForRequest((request) => request.method() === 'POST' && /advisor\/(stream|runs)/.test(request.url()) && (request.postData() ?? '').includes('"skill":"berater-interview"') && (request.postData() ?? '').includes('1: Ja'), { timeout: 15_000 })
    await byId(page, 'advisor-question-submit').click()
    await roundSent.catch(() => fail('Row S: the answers should go out as one message with the skill attached'))

    // /grill-me, as one knows it from other assistants: offered while typing, an unknown command is named.
    await byId(page, 'advisor-chat-input').fill('/zauber')
    await byId(page, 'advisor-chat-send').click()
    if (!(await textOf(page, 'advisor-slash-unknown')).includes('/grill-me')) fail('Row S: an unknown command should name the ones there are')
    await byId(page, 'advisor-chat-input').fill('/gr')
    await see(page, 'advisor-slash-menu', 'Row S')
    const started = page.waitForRequest((request) => request.method() === 'POST' && /advisor\/(stream|runs)/.test(request.url()) && (request.postData() ?? '').includes('"skill":"berater-interview"') && (request.postData() ?? '').includes('Berater-Interview'), { timeout: 15_000 })
    await byId(page, 'advisor-slash-item').click()
    await started.catch(() => fail('Row S: /grill-me should start the interview with the skill attached'))
    console.log(`[${TAG}] ✅ Row S — skills: listed and switchable, a round needs all answers and sends them with the skill; /grill-me starts it`)

    // Row T — several files at once (#497): read one after another, the waiting ones are named and can
    // be taken out. The first upload is held back, so the queue can be seen.
    await page.unroute('**/advisor/session*')
    await page.route('**/belege/upload*', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await new Promise((resolve) => setTimeout(resolve, 4000))
      return route.fallback()
    })
    await page.reload({ waitUntil: 'networkidle' })
    await byId(page, 'advisor-receipt-attach-btn').click()
    await byId(page, 'advisor-receipt-file-input').setInputFiles(['a.pdf', 'b.jpg', 'c.png'].map((name) => ({ name, mimeType: name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', buffer: Buffer.from([1, 2, 3]) })))
    await see(page, 'advisor-receipt-queue', 'Row T', 10_000)
    if ((await byId(page, 'advisor-receipt-queue-item').count()) !== 2) fail('Row T: the two waiting files should be listed')
    await byId(page, 'advisor-receipt-queue-item').first().click()
    if ((await byId(page, 'advisor-receipt-queue-item').count()) !== 1) fail('Row T: a waiting file should be removable from the queue')
    console.log(`[${TAG}] ✅ Row T — several files: queued one after another, named, removable`)

    // Row O — the owl opens a new conversation herself (ADR-0067 §11): the app says the case
    // changed, so the empty chat starts an opening turn; its placeholder question is never shown.
    // Nothing changed: no turn, a link to the last opening. Nothing entered: the way into the interview.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    const openingState = { stage: 'ready', shouldOpen: true, lastOpening: null }
    await page.route('**/advisor/opening', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(openingState) }))
    await page.route('**/advisor/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          [1, 'start', { runId: 'stub-opening', userMessage: { id: 'stub-uo', role: 'user', content: 'Neues Gespräch', meta: { opening: { fingerprint: 'abcd1234', stage: 'ready' } }, createdAt: new Date().toISOString(), status: 'complete' }, assistantMessageId: 'stub-ao' }],
          [2, 'token', { text: 'Dein Fall in Kürze: Homeoffice bringt dir 528 €.' }],
          [3, 'done', { mode: 'langgraph', userMessage: null, assistantMessage: null }],
        ]),
      }),
    )
    await page.reload({ waitUntil: 'networkidle' })
    const openingAsked = page.waitForRequest((request) => request.url().includes('/advisor/stream') && request.method() === 'POST', { timeout: 15_000 })
    await byId(page, 'eule-conversation-new').click()
    const openingBody = JSON.parse((await openingAsked.catch(() => fail('Row O: a new conversation of a changed case should open with the owl speaking'))).postData() ?? '{}')
    if (openingBody.quickAction !== 'opening') fail(`Row O: the opening should be sent as quickAction "opening", sent ${JSON.stringify(openingBody)}`)
    await page.waitForFunction(() => document.querySelector('[data-testid="advisor-chat-scroll"]')?.textContent?.includes('Dein Fall in Kürze'), null, { timeout: 10_000 }).catch(() => fail('Row O: the opening should be shown'))
    if ((await byId(page, 'advisor-user-message').count()) !== 0) fail('Row O: the placeholder question of an opening must not be shown')

    Object.assign(openingState, { shouldOpen: false, lastOpening: { conversationId: 'stub-last', createdAt: '2026-11-13T09:00:00.000Z' } })
    let streamsAfter = 0
    await page.unroute('**/advisor/stream')
    await page.route('**/advisor/stream', (route) => {
      streamsAfter += 1
      return route.fulfill({ status: 500, body: '' })
    })
    // The stubbed opening left the conversation empty on the server, so it is still the open one: a reload asks again.
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-opening-last', 'Row O', 15_000)
    if (!(await textOf(page, 'advisor-opening-last')).includes('13.11.2026')) fail('Row O: the link should name the day of the last opening')
    if (streamsAfter !== 0) fail('Row O: nothing changed, so no opening should be asked for')

    Object.assign(openingState, { stage: 'empty', lastOpening: null })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'advisor-opening-start', 'Row O', 15_000)
    if (!(await textOf(page, 'advisor-opening-start')).includes('Lass uns anfangen')) fail('Row O: an empty year should offer the way into the interview')
    console.log(`[${TAG}] ✅ Row O — the owl opens a changed case herself without showing a question, links to her last opening otherwise, and an empty year starts with the interview`)

    // Row P — tax years as projects (#503): the open year heads the list, the other years with
    // conversations wait in its menu, a conversation that is answering says so, and choosing another
    // year opens it at its latest conversation. Last on this page, because it leaves the year switched.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      const year = json.projects[0].taxYear
      json.conversations = json.conversations.map((c, i) => ({ ...c, answering: i === 0 }))
      json.projects = [
        { taxYear: year, conversations: json.conversations },
        { taxYear: year - 1, conversations: [{ id: 'stub-old-year', title: 'Umzug nach Köln', createdAt: now, lastUsedAt: now, answering: false }] },
      ]
      await route.fulfill({ response: res, json })
    })
    await page.reload({ waitUntil: 'networkidle' })
    await see(page, 'eule-project-heading', 'Row P', 20_000)
    const openYear = Number((await textOf(page, 'eule-project-heading')).replace(/\D/g, ''))
    if (!Number.isInteger(openYear) || openYear < 2020) fail(`Row P: the list should be headed by the open tax year, reads "${await textOf(page, 'eule-project-heading')}"`)
    await see(page, 'eule-conversation-answering', 'Row P')
    if ((await byId(page, 'eule-year-menu').count()) !== 0) fail('Row P: the year menu starts closed')
    await byId(page, 'eule-year-menu-toggle').click()
    await see(page, 'eule-year-option', 'Row P')
    if (!(await textOf(page, 'eule-year-option')).includes(String(openYear - 1))) fail('Row P: the other year should be offered in the menu')
    const otherYearAsked = page.waitForRequest((request) => request.url().includes(`/steuerjahre/${openYear - 1}/advisor/session`) && request.url().includes('stub-old-year'), { timeout: 15_000 })
    await byId(page, 'eule-year-option').click()
    await otherYearAsked.catch(() => fail('Row P: choosing another year should open that year at its latest conversation'))
    console.log(`[${TAG}] ✅ Row P — tax years as projects: open year on top, other years in its menu, answering marked, another year opens at its conversation`)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await ctx.close()

    // Row J — on a phone the conversations open as a drawer from the left; the notes stay behind the chip.
    const phone = await newContextAtBreakpoint(browser, 's')
    const small = await phone.newPage()
    guardAgainst429(small, fail, '/api/auth/')
    await skipSplash(small, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await submitLogin(small, email, TEST_PASSWORD)
    await small.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await small.getByRole('tab', { name: 'Eule' }).click()
    await see(small, 'eule-chat-main', 'Row J', 20_000)
    if ((await byId(small, 'eule-project-sidebar').count()) !== 0) fail('Row J: no sidebar on a phone')
    await byId(small, 'eule-conversations-btn').click()
    await see(small, 'eule-conversations-drawer', 'Row J')
    await see(small, 'eule-conversation-row', 'Row J')
    if ((await byId(small, 'eule-conversations-drawer').locator('[data-testid="eule-notes"]').count()) !== 0) fail('Row J: the notes do not belong in the drawer')
    await small.keyboard.press('Escape')
    await gone(small, 'eule-conversation-row', 'Row J')
    await byId(small, 'eule-situation-chip').click()
    await see(small, 'eule-notes', 'Row J')
    await small.keyboard.press('Escape')
    await gone(small, 'eule-notes', 'Row J')

    // What an adviser does unasked is one tap away on an empty chat (#501): the savings plan and the
    // check of the tax office's notice. The chip sends its quick action.
    await small.route('**/advisor/session*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = []
      await route.fulfill({ response: res, json })
    })
    await small.reload({ waitUntil: 'networkidle' })
    // Four quick starts show; the savings plan waits behind "Mehr …".
    await see(small, 'advisor-chip-bescheid', 'Row J', 20_000)
    if ((await byId(small, 'advisor-chip-sparplan').count()) !== 0) fail('Row J: only four quick starts show before "Mehr …"')
    await byId(small, 'advisor-chips-more').click()
    await see(small, 'advisor-chip-sparplan', 'Row J')
    for (const id of ['advisor-chip-homeoffice', 'advisor-chip-endpruefung', 'advisor-chip-fortbildung', 'advisor-chip-spenden']) await see(small, id, 'Row J')
    const planAsked = small.waitForRequest((request) => request.method() === 'POST' && /advisor\/(stream|runs)/.test(request.url()) && (request.postData() ?? '').includes('"quickAction":"savings_plan"'), { timeout: 15_000 })
    await byId(small, 'advisor-chip-sparplan').click()
    await planAsked.catch(() => fail('Row J: the savings plan chip should send quickAction=savings_plan'))
    await small.unrouteAll({ behavior: 'ignoreErrors' })
    await phone.close()
    console.log(`[${TAG}] ✅ Row J — on a phone the conversations open as a drawer, the notes behind the chip, four quick starts before "Mehr …"`)

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
