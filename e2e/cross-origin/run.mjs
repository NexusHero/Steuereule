// Cross-origin browser smoke gate (M2 CI-hardening).
//
// The class of bug this automates: the two CORS defects (#106 — the hijacked
// better-auth mount silently dropping headers on the *real*, non-OPTIONS response;
// #108 — `enableCors`'s default `methods` list silently excluding PUT) were both
// invisible to every unit/integration test and to `curl`/Node's own `fetch()` (neither
// enforces CORS — they'll happily read a response body the browser would have blocked).
// They were only caught by a manual cross-origin Playwright pass. This script is that
// pass, automated: a real headless Chromium page loaded from the WEB origin drives
// credentialed `fetch()` calls at the (different-port, therefore cross-origin) API
// origin, so the actual browser CORS/preflight/credentialed-cookie machinery is what's
// under test — not an approximation of it.
//
// Assumes the caller (CI job / local script) has already booted:
//   - the compiled API (`dist/main.js`) on API_ORIGIN, with CORS_ALLOWED_ORIGINS set to
//     WEB_ORIGIN, and polled it ready;
//   - the exported web bundle (`expo export --platform web`, built with
//     EXPO_PUBLIC_API_BASE_URL=API_ORIGIN) statically served on WEB_ORIGIN, and polled
//     ready (see static-server.mjs).
//
// Exits non-zero (and prints a clear reason) on the first failed assertion — no
// sleeps, no soft-fail: this is a merge gate, not a report.
import { chromium } from 'playwright-core'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')
const API_ORIGIN = requireEnv('API_ORIGIN')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`::error::${name} is required (set by the CI step/script that boots the two origins).`)
    process.exit(1)
  }
  return value
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

/**
 * Runs an in-page credentialed fetch against `API_ORIGIN`, and independently captures
 * the *real* network response's headers via Playwright's CDP-level network events (not
 * the in-page `Response` object — `Access-Control-Allow-Origin` is not one of the
 * CORS-safelisted response headers exposed to page JS, so reading it that way would
 * silently pass even if the header were missing). This is the two-part proof the
 * cross-origin regressions need: (a) the in-page fetch must actually resolve — a real
 * browser rejects the promise if the response fails CORS, which is exactly how #106
 * would fail loudly again; (b) the wire-level header must be the real allow-listed
 * WEB_ORIGIN, not merely "something" — belt and suspenders against a regression that
 * happens to still let the fetch through some other way.
 */
async function credentialedFetch(page, { method, path, body }) {
  const url = `${API_ORIGIN}${path}`

  // Registered *before* triggering the fetch below, so it can observe the real
  // response's headers if the browser gets far enough to receive one. Deliberately a
  // short, bounded wait (event-driven, not a sleep) rather than the default 30s: when
  // CORS is genuinely broken, Chromium aborts the request outright (net::ERR_FAILED)
  // and never fires a 'response' event for it at all — this must resolve to `null`
  // quickly in that case, not hang the whole gate.
  const waitForReal = page
    .waitForResponse((response) => response.url() === url && response.request().method() === method, {
      timeout: 5_000,
    })
    .catch(() => null)

  const evalPromise = page.evaluate(
    async ({ url, method, body }) => {
      try {
        const response = await fetch(url, {
          method,
          credentials: 'include',
          mode: 'cors',
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const text = await response.text()
        return { ok: response.ok, status: response.status, body: text }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
    { url, method, body },
  )

  const [realResponse, evalResult] = await Promise.all([waitForReal, evalPromise])

  // Check the in-page result FIRST: when CORS is broken, the browser fails the fetch
  // itself (this is the loud, real-user-facing symptom) — that message is more
  // actionable than "no network response event observed", so report it first even
  // though both signals point at the same regression.
  if (evalResult.error) {
    fail(
      `Browser fetch ${method} ${path} threw — a real browser fails exactly this way when the response ` +
        `isn't CORS-readable (missing/incorrect Access-Control-Allow-Origin or -Credentials on the real ` +
        `response, or a failed preflight): ${evalResult.error}`,
    )
  }
  if (!evalResult.ok) {
    fail(`Browser fetch ${method} ${path} did not succeed: status=${evalResult.status} body=${evalResult.body}`)
  }

  if (!realResponse) {
    fail(
      `${method} ${path}: the in-page fetch reported success, but no real network response was observed to ` +
        `verify its headers against — treat this as a failure, not a pass.`,
    )
  }

  const allowOrigin = realResponse.headers()['access-control-allow-origin']
  if (allowOrigin !== WEB_ORIGIN) {
    fail(
      `${method} ${path}: expected Access-Control-Allow-Origin: ${WEB_ORIGIN} on the real, non-OPTIONS response — ` +
        `got ${JSON.stringify(allowOrigin)}. This is the exact class of regression #106/#108 reintroduce.`,
    )
  }

  return { evalResult, realResponse }
}

/**
 * F3 (Musti's T1 review on PR #153, REQ-011): the two existing CORS-exposure regression
 * tests (`apps/api/test/cors.acceptance.test.ts` and
 * `apps/api/test/acceptance/req-011-export.test.ts`) both assert the
 * `access-control-expose-headers` *string* via Node's `fetch()` — and Node/`curl` never
 * enforce CORS at all, so that only proves the server opts in. It cannot prove a browser
 * can actually read the header. The real bug (steuereule#152) was exactly that gap:
 * `Content-Disposition` is not one of the CORS-safelisted response headers a browser
 * exposes to page JS by default, so `exportDownload.ts`'s
 * `response.headers.get('content-disposition')` silently returned `null` and the download
 * fell back to a generic filename — invisible to every test that doesn't run inside a real
 * browser. This function is that proof: a real, credentialed, cross-origin in-page fetch,
 * reading the header exactly the way `exportDownload.ts` does.
 */
async function assertExportFilenameReadableInPage(page) {
  const url = `${API_ORIGIN}/v1/account/export?format=json`
  const result = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { credentials: 'include', mode: 'cors' })
      return { ok: response.ok, status: response.status, contentDisposition: response.headers.get('content-disposition') }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }, url)

  if (result.error) {
    fail(`Browser fetch GET /v1/account/export?format=json threw: ${result.error}`)
  }
  if (!result.ok) {
    fail(`GET /v1/account/export?format=json did not succeed: status=${result.status}`)
  }
  if (result.contentDisposition === null || result.contentDisposition === undefined) {
    fail(
      "In-page response.headers.get('content-disposition') was null — the browser did not expose the " +
        'header to page JS even though the server presumably sent it. This is the exact class of the ' +
        'REQ-011 export-filename bug (steuereule#152, PR #153 finding F3): main.ts\'s enableCors ' +
        "options must list 'Content-Disposition' in exposedHeaders (or the shared CORS-options builder, " +
        'once #155 lands) for a real browser — not curl/Node fetch — to ever see it.',
    )
  }
  const filenameMatch = /filename="steuereule-export-\d{4}-\d{2}-\d{2}\.json"/.exec(result.contentDisposition)
  if (!filenameMatch) {
    fail(
      `In-page Content-Disposition was readable but did not carry the expected dated filename pattern: ` +
        `${JSON.stringify(result.contentDisposition)}`,
    )
  }
  return result.contentDisposition
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()

    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    // 1) Prove the web bundle actually BOOTS (Salih's "prove it boots, first, always" —
    // a bundler/runtime break here would fail this before any CORS assertion runs).
    await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
    const bodyText = await page.evaluate(() => document.body.innerText)
    if (pageErrors.length > 0) {
      fail(`Web bundle threw at boot: ${pageErrors.join('; ')}`)
    }
    if (!bodyText.includes('SteuerEule')) {
      fail(`Web bundle did not render the expected boot content. Got: ${bodyText.slice(0, 200)}`)
    }
    console.log('[cross-origin-smoke] web bundle booted cleanly at', WEB_ORIGIN)

    // 2) Drive the real credentialed cross-origin auth+profile journey, from a page
    // whose origin is genuinely different from the API's (different port = different
    // origin, browser same-origin policy keys on scheme+host+port).
    const email = `cross-origin-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const password = 'CrossOrigin-Smoke-1!'

    await credentialedFetch(page, {
      method: 'POST',
      path: '/api/auth/sign-up/email',
      body: { email, password, name: 'Cross Origin Smoke' },
    })
    console.log('[cross-origin-smoke] signup: cross-origin readable, cookie set')

    await credentialedFetch(page, { method: 'GET', path: '/api/auth/get-session' })
    console.log('[cross-origin-smoke] get-session (post-signup): cross-origin readable')

    await credentialedFetch(page, { method: 'POST', path: '/api/auth/sign-out' })
    console.log('[cross-origin-smoke] sign-out: cross-origin readable')

    await credentialedFetch(page, {
      method: 'POST',
      path: '/api/auth/sign-in/email',
      body: { email, password },
    })
    console.log('[cross-origin-smoke] login: cross-origin readable, cookie set')

    await credentialedFetch(page, { method: 'GET', path: '/api/auth/get-session' })
    console.log('[cross-origin-smoke] get-session (post-login): cross-origin readable')

    // PUT + a JSON content-type is a non-"simple" request — the browser issues a real
    // OPTIONS preflight first. If #108 regresses (methods list loses PUT again), that
    // preflight fails closed and the browser never even sends the real PUT — the
    // in-page fetch() promise rejects, which credentialedFetch()'s `evalResult.error`
    // check surfaces with a message naming the bug class.
    await credentialedFetch(page, {
      method: 'PUT',
      path: '/v1/profile',
      body: { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358' },
    })
    console.log('[cross-origin-smoke] PUT /v1/profile: cross-origin readable (preflight + real PUT both succeeded)')

    // F3 (Musti's T1 review on PR #153, REQ-011) — see assertExportFilenameReadableInPage's
    // header comment: the existing CORS-exposure regression tests can't prove a browser can
    // read Content-Disposition; this does, against the real running stack.
    const contentDisposition = await assertExportFilenameReadableInPage(page)
    console.log(
      `[cross-origin-smoke] GET /v1/account/export?format=json: Content-Disposition readable in-page — ${contentDisposition}`,
    )

    console.log('[cross-origin-smoke] PASS — all credentialed cross-origin flows completed and were readable.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[cross-origin-smoke] FAIL —', error?.message ?? error)
  process.exit(1)
})
