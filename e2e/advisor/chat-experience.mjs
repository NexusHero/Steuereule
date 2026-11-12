// Chat experience gate (#451 slice 1, AC 1–4): Enter vs. Shift+Enter on a computer, Enter never
// sends on a phone, Stop closes the stream request and leaves an "abgebrochen" bubble with
// "Noch mal fragen" and no proposal, reduced motion swaps the turning owl for pulsing dots.
//
// The stop rows hold the stream request open with `page.route` (the handler never answers), so the
// gate does not depend on a language model: the only way that request ends is the client's abort,
// which Playwright reports as `requestfailed`.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'chat-experience'
const STREAM = '**/advisor/stream'

async function signIn(page, webOrigin, email) {
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await submitLogin(page, email, TEST_PASSWORD)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
}

async function openOwl(page) {
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="eulen-modus-screen"]').waitFor({ state: 'visible', timeout: 15_000 })
}

function countStreamRequests(page) {
  const counter = { value: 0 }
  page.on('request', (req) => {
    if (req.url().includes('/advisor/stream')) counter.value += 1
  })
  return counter
}

async function desktopRows(browser, webOrigin, email) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await signIn(page, webOrigin, email)
  await openOwl(page)
  const streams = countStreamRequests(page)
  const input = page.locator('[data-testid="advisor-chat-input"]')
  await input.waitFor({ state: 'visible', timeout: 10_000 })

  // Row A — Shift+Enter breaks the line and sends nothing.
  await input.click()
  await page.keyboard.type('Zeile eins')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('Zeile zwei')
  const value = await input.inputValue()
  if (!value.includes('\n')) fail(`Row A: Shift+Enter should insert a line break, field holds ${JSON.stringify(value)}`)
  if (streams.value !== 0) fail('Row A: Shift+Enter must not send the question')
  console.log(`[${TAG}] ✅ Row A — Shift+Enter inserts a line break on the computer`)

  // Row B — Enter sends; the real (deterministic) answer arrives in an assistant bubble.
  await input.fill('Bitte 400 € Spenden eintragen')
  await input.press('Enter')
  await page.locator('[data-testid="advisor-assistant-message"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  if (streams.value !== 1) fail(`Row B: Enter should send exactly one question, saw ${streams.value} stream requests`)
  if ((await input.inputValue()) !== '') fail('Row B: the field should be empty after sending')
  console.log(`[${TAG}] ✅ Row B — Enter sends on the computer and the answer lands in the owl's bubble`)

  // Row C — Stop closes the request, keeps an aborted bubble, offers no proposal.
  const actionCardsBefore = await page.locator('[data-testid="advisor-action-card"]').count()
  await page.route(STREAM, () => {
    /* never answer: only the client's abort can end this request */
  })
  const failed = page.waitForEvent('requestfailed', { predicate: (r) => r.url().includes('/advisor/stream'), timeout: 10_000 })
  await input.fill('Wie setze ich Homeoffice ab?')
  await input.press('Enter')
  await page.locator('[data-testid="eule-thinking-owl"], [data-testid="eule-thinking-dots"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="advisor-chat-stop"]').click()
  await failed.catch(() => fail('Row C: Stop must close the stream request (no requestfailed event seen)'))
  await page.locator('[data-testid="advisor-message-aborted"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="advisor-retry"]').waitFor({ state: 'visible', timeout: 5_000 })
  if ((await page.locator('[data-testid="advisor-action-card"]').count()) !== actionCardsBefore) {
    fail('Row C: a stopped answer must not offer a proposal')
  }
  console.log(`[${TAG}] ✅ Row C — Stop closes the request; "abgebrochen" with "Noch mal fragen", no proposal`)

  // Row D — Escape stops as well.
  const failedAgain = page.waitForEvent('requestfailed', { predicate: (r) => r.url().includes('/advisor/stream'), timeout: 10_000 })
  await page.locator('[data-testid="advisor-retry"]').click()
  await page.locator('[data-testid="advisor-chat-stop"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.keyboard.press('Escape')
  await failedAgain.catch(() => fail('Row D: Escape must close the stream request'))
  await page.locator('[data-testid="advisor-message-aborted"]').waitFor({ state: 'visible', timeout: 10_000 })
  console.log(`[${TAG}] ✅ Row D — Escape stops the answer too`)

  // Row E — the owl turns its head while thinking (motion allowed).
  await page.locator('[data-testid="advisor-retry"]').click()
  await page.locator('[data-testid="eule-thinking-owl"]').waitFor({ state: 'visible', timeout: 10_000 })
  const live = await page.locator('[data-testid="advisor-thinking-status"]').getAttribute('aria-live')
  if (live !== 'polite') fail(`Row E: the thinking status must be a polite live region, got aria-live=${live}`)
  await page.locator('[data-testid="advisor-chat-stop"]').click()
  console.log(`[${TAG}] ✅ Row E — turning owl with a polite live status`)

  await ctx.close()
}

async function reducedMotionRow(browser, webOrigin, email) {
  const ctx = await newContextAtBreakpoint(browser, 'l', { reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await signIn(page, webOrigin, email)
  await openOwl(page)
  await page.route(STREAM, () => {})
  const input = page.locator('[data-testid="advisor-chat-input"]')
  await input.fill('Was hab ich vergessen?')
  await input.press('Enter')
  await page.locator('[data-testid="eule-thinking-dots"]').waitFor({ state: 'visible', timeout: 10_000 })
  if ((await page.locator('[data-testid="eule-thinking-owl"]').count()) !== 0) {
    fail('Row F: with prefers-reduced-motion the owl must not turn its head')
  }
  await page.locator('[data-testid="advisor-chat-stop"]').click()
  console.log(`[${TAG}] ✅ Row F — reduced motion shows only pulsing dots`)
  await ctx.close()
}

async function phoneRow(browser, webOrigin, email) {
  const ctx = await newContextAtBreakpoint(browser, 's', { isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await signIn(page, webOrigin, email)
  await openOwl(page)
  const streams = countStreamRequests(page)
  // On a phone the chat is the screen (#476): its own composer, no dock to open first.
  const input = page.locator('[data-testid="advisor-chat-input"]')
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  await input.click()
  await page.keyboard.type('Kurze Frage')
  await page.keyboard.press('Enter')
  if (streams.value !== 0) fail('Row G: Enter on a phone must not send')
  if (!(await input.inputValue()).includes('\n')) fail('Row G: Enter on a phone should break the line')
  await page.locator('[data-testid="advisor-chat-send"]').click()
  await page.locator('[data-testid="advisor-assistant-message"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  if (streams.value !== 1) fail(`Row G: the send button should send once, saw ${streams.value}`)
  console.log(`[${TAG}] ✅ Row G — phone: Enter breaks the line, only the button sends`)
  await ctx.close()
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const email = `chat-experience-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    await desktopRows(browser, webOrigin, email)
    await reducedMotionRow(browser, webOrigin, email)
    await phoneRow(browser, webOrigin, email)
    console.log(`[${TAG}] PASS — Enter, Stop, aborted bubble, thinking owl and reduced motion verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
