// Dictation gate (#451 slice 5, AC 8–10, ADR-0061). Headless Chromium has no WebGPU adapter, so
// Row A checks the honest default (no mic, the step-1 hint). Rows B–D stub only what a CI runner
// cannot provide — a WebGPU adapter, the device memory and the microphone — and answer Hugging Face
// requests with bytes that do not match the pinned SHA-256: the gate proves that nothing is
// requested before consent, that after consent only huggingface.co is contacted, and that a
// mismatch is refused, nothing is cached and the microphone is never opened. It never downloads
// the real model.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const TEST_PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'dictation'

/** Runs before app code: a pretend WebGPU device and a microphone that only counts calls. */
function stubDevice() {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } })
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 })
  window.__micCalls = 0
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micCalls += 1
    throw new DOMException('denied in test', 'NotAllowedError')
  }
}

async function signIn(page, webOrigin, email) {
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="advisor-chat-panel"]').waitFor({ state: 'visible', timeout: 15_000 })
}

function watchHosts(page, ownOrigins) {
  const seen = { hf: [], foreign: [] }
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:' || ownOrigins.has(url.origin)) return
    // Hugging Face serves large files from its own CDN (e.g. us.aws.cdn.hf.co) after a redirect.
    if (url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co')) seen.hf.push(req.url())
    else seen.foreign.push(req.url())
  })
  return seen
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  const own = new Set([new URL(apiOrigin).origin, new URL(webOrigin).origin])
  try {
    const email = `dictation-e2e-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    // Row A — without WebGPU there is no mic, only the step-1 hint, and nothing goes to Hugging Face.
    {
      const ctx = await newContextAtBreakpoint(browser, 'l')
      const page = await ctx.newPage()
      guardAgainst429(page, fail, '/api/auth/')
      const seen = watchHosts(page, own)
      await signIn(page, webOrigin, email)
      await page.locator('[data-testid="advisor-dictation-hint"]').waitFor({ state: 'visible', timeout: 10_000 })
      if ((await page.locator('[data-testid="advisor-dictation-mic"]').count()) !== 0) fail('Row A: no mic without WebGPU')
      if (seen.hf.length > 0) fail(`Row A: nothing may go to Hugging Face, saw ${seen.hf[0]}`)
      console.log(`[${TAG}] ✅ Row A — no WebGPU: no mic, the step-1 hint, no request to Hugging Face`)
      await ctx.close()
    }

    const ctx = await newContextAtBreakpoint(browser, 'l')
    await ctx.addInitScript(stubDevice)
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    const seen = watchHosts(page, own)
    await page.route('https://huggingface.co/**', (route) => route.fulfill({ status: 200, body: 'not the pinned model' }))

    // The self-hosted runtime is part of the export (ADR-0061 §4).
    for (const asset of ['dictation-worker.mjs', 'transformers.min.js', 'ort/ort-wasm-simd-threaded.asyncify.wasm']) {
      const res = await fetch(`${webOrigin}/dictation/${asset}`, { method: 'HEAD' })
      if (res.status !== 200) fail(`self-hosted dictation asset /dictation/${asset} answered ${res.status}`)
    }

    await signIn(page, webOrigin, email)

    // Row B — the mic asks first; declining sends nothing anywhere.
    const mic = page.locator('[data-testid="advisor-dictation-mic"]')
    await mic.waitFor({ state: 'visible', timeout: 10_000 })
    await mic.click()
    const consent = page.locator('[data-testid="dictation-consent"]')
    await consent.waitFor({ state: 'visible', timeout: 5_000 })
    const consentText = await consent.innerText()
    if (!consentText.includes('Hugging Face (USA)') || !consentText.includes('IP-Adresse')) fail(`Row B: consent must name Hugging Face (USA) and the IP address, got "${consentText}"`)
    await page.locator('[data-testid="dictation-consent-decline"]').click()
    await page.waitForTimeout(500)
    if (seen.hf.length > 0) fail('Row B: declining must not contact Hugging Face')
    console.log(`[${TAG}] ✅ Row B — mic asks first (Hugging Face, USA, IP address); declining sends nothing`)

    // Row C — after consent only huggingface.co is contacted; a checksum mismatch is refused.
    await mic.click()
    await page.locator('[data-testid="dictation-consent-accept"]').click()
    const error = page.locator('[data-testid="dictation-error"]')
    await error.waitFor({ state: 'visible', timeout: 15_000 })
    if (!(await error.innerText()).includes('stimmt nicht')) fail('Row C: a checksum mismatch must be named')
    if (seen.hf.length === 0) fail('Row C: after consent the model is requested from huggingface.co')
    if (!seen.hf.filter((url) => new URL(url).hostname === 'huggingface.co').every((url) => url.includes('/resolve/27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c/'))) fail(`Row C: only the pinned commit may be requested, saw ${seen.hf[0]}`)
    const cached = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('steuereule-dictation')).length)
    if (cached !== 0) fail('Row C: nothing of a mismatching download may stay in the cache')
    if ((await page.evaluate(() => window.__micCalls)) !== 0) fail('Row C: the microphone must not open before a verified model is ready')
    console.log(`[${TAG}] ✅ Row C — after consent only the pinned huggingface.co commit; mismatch refused, nothing cached, mic untouched`)

    // Row D — no other third host at any point (AC 8 / decision 7).
    if (seen.foreign.length > 0) fail(`Row D: requests to other hosts: ${seen.foreign.slice(0, 3).join(', ')}`)
    console.log(`[${TAG}] ✅ Row D — no request to any host but the app and Hugging Face`)

    await ctx.close()
    console.log(`[${TAG}] PASS — dictation gated by WebGPU, consent before download, pinned + checksum-verified, no audio out.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
