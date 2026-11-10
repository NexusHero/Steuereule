// Plan-in-chat gate (#451 slice 6, AC 11–14). The language model is stubbed inside the page: an
// init script answers the stream request with a ReadableStream this script feeds event by event
// (`window.__kiStub.push(event, data)`), so the checklist can be watched changing live and Stop can
// land in the middle of a plan. Everything else — sign-in, the session read, apply endpoints — is the
// real stack; the gate watches the real network for any write the plan might make on its own.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'plan-in-chat'

/** Runs in the page before any app code: a controllable stand-in for the model's SSE stream. */
function installKiStub() {
  const realFetch = window.fetch.bind(window)
  const encoder = new TextEncoder()
  window.__kiStub = { bodies: [], controller: null, push: null }
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!url.includes('/advisor/stream')) return realFetch(input, init)
    window.__kiStub.bodies.push(JSON.parse(init.body))
    const body = new ReadableStream({
      start(controller) {
        window.__kiStub.push = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        window.__kiStub.close = () => controller.close()
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
      },
    })
    return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
  }
}

const push = (page, event, data) => page.evaluate(([e, d]) => window.__kiStub.push(e, d), [event, data])

async function stepText(page, n) {
  return page.locator(`[data-testid="advisor-plan-step-${n}"]`).innerText()
}

async function waitForStep(page, n, glyph, label) {
  await page
    .waitForFunction(([i, g]) => document.querySelector(`[data-testid="advisor-plan-step-${i}"]`)?.textContent?.includes(g), [n, glyph], { timeout: 5_000 })
    .catch(async () => fail(`${label}: step ${n} should show ${glyph}, shows "${await stepText(page, n).catch(() => '(missing)')}"`))
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const email = `plan-in-chat-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    await ctx.addInitScript(installKiStub)
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')

    // Every write the stack could see: a plan must never cause one by itself (AC 13).
    const writes = []
    page.on('request', (req) => {
      const method = req.method()
      if (method === 'GET' || method === 'OPTIONS' || req.url().includes('/advisor/stream') || req.url().includes('/api/auth/')) return
      writes.push(`${method} ${new URL(req.url()).pathname}`)
    })

    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Eule' }).click()
    await page.locator('[data-testid="advisor-chat-panel"]').waitFor({ state: 'visible', timeout: 15_000 })
    const writesBefore = writes.length

    // Row A — the quick start sends forgotten_check and the checklist changes live (AC 11, AC 12).
    await page.locator('[data-testid="advisor-chip-vergessen"]').click()
    await page.waitForFunction(() => window.__kiStub.push !== null, null, { timeout: 5_000 })
    const sent = await page.evaluate(() => window.__kiStub.bodies.at(-1))
    if (sent.quickAction !== 'forgotten_check') fail(`Row A: the chip must send quickAction=forgotten_check, sent ${JSON.stringify(sent)}`)

    await push(page, 'status', { text: 'Eule prüft deine Akte & Paragraphen …' })
    await push(page, 'plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'laeuft' }, { text: 'Spenden prüfen', status: 'offen' }] })
    await waitForStep(page, 1, '◐', 'Row A')
    await waitForStep(page, 2, '○', 'Row A')
    await push(page, 'plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Spenden prüfen', status: 'laeuft' }] })
    await waitForStep(page, 1, '✓', 'Row A')
    await waitForStep(page, 2, '◐', 'Row A')
    console.log(`[${TAG}] ✅ Row A — the chip sends forgotten_check; ○ → ◐ → ✓ change live`)

    // Row B — after the answer the checklist collapses to „2 Schritte erledigt ▸“ and expands (AC 11).
    await push(page, 'plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Spenden prüfen', status: 'erledigt' }] })
    await push(page, 'token', { text: 'Bei den Spenden fehlt noch eine Bescheinigung.' })
    await page.locator('[data-testid="advisor-streaming-message"]').waitFor({ state: 'visible', timeout: 5_000 })
    const now = new Date().toISOString()
    await page.route('**/advisor/session', async (route) => {
      // The page may close while this read is in flight; a late answer is irrelevant then.
      const res = await route.fetch().catch(() => null)
      if (res === null) return
      const json = await res.json()
      json.messages = [
        { id: 'stub-u1', role: 'user', content: 'Was hab ich vergessen?', meta: null, createdAt: now },
        { id: 'stub-a1', role: 'assistant', content: 'Bei den Spenden fehlt noch eine Bescheinigung.', meta: null, createdAt: now },
      ]
      await route.fulfill({ response: res, json })
    })
    await push(page, 'done', { mode: 'langgraph', userMessage: null, assistantMessage: null })
    await page.evaluate(() => window.__kiStub.close())
    const toggle = page.locator('[data-testid="advisor-plan-toggle"]')
    await toggle.waitFor({ state: 'visible', timeout: 10_000 })
    const summary = await toggle.innerText()
    if (!summary.includes('2 Schritte erledigt') || !summary.includes('▸')) fail(`Row B: expected „2 Schritte erledigt ▸“, got "${summary}"`)
    if ((await page.locator('[data-testid="advisor-plan-step-1"]').count()) !== 0) fail('Row B: a finished plan starts collapsed')
    await toggle.click()
    await waitForStep(page, 2, '✓', 'Row B')
    console.log(`[${TAG}] ✅ Row B — finished plan collapses to „2 Schritte erledigt ▸“ above the answer and expands`)

    // Row C — Stop in the middle of a plan: finished steps stay, the running one is aborted (AC 14).
    await page.unroute('**/advisor/session', { behavior: 'ignoreErrors' })
    const input = page.locator('[data-testid="advisor-chat-input"]')
    await input.fill('Prüf bitte Arbeitsweg und Riester')
    await input.press('Enter')
    await page.waitForFunction(() => window.__kiStub.bodies.length === 2, null, { timeout: 5_000 })
    await push(page, 'plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Riester prüfen', status: 'laeuft' }] })
    await waitForStep(page, 2, '◐', 'Row C')
    await page.locator('[data-testid="advisor-chat-stop"]').click()
    await page.locator('[data-testid="advisor-message-aborted"]').waitFor({ state: 'visible', timeout: 5_000 })
    await waitForStep(page, 1, '✓', 'Row C')
    await waitForStep(page, 2, 'abgebrochen', 'Row C')
    console.log(`[${TAG}] ✅ Row C — Stop mid-plan keeps ✓ steps and marks the running one „abgebrochen“`)

    // Row D — nothing above wrote to the file (AC 13).
    const planWrites = writes.slice(writesBefore)
    if (planWrites.length > 0) fail(`Row D: the plan must not write without a click, saw ${planWrites.join(', ')}`)
    console.log(`[${TAG}] ✅ Row D — no write request while the plan ran`)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await ctx.close()
    console.log(`[${TAG}] PASS — live plan, collapse, Stop mid-plan and zero-write verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
