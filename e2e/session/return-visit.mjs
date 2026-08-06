// Return-visit / re-authentication acceptance gate (#295's occasion) — the stakeholder's own
// words: "Könnten wir auch einen schweren Test machen, wo man sich nicht einloggt, Browser neu
// lädt und solche Szenen?" This is that test, real stack, real Chromium, no mocks.
//
// *** THE #295 BOUNDARY — READ BEFORE TRUSTING A GREEN RUN HERE ***
//
// #295 recorded a real, unreproduced incident: the stakeholder's #274 compose stack ran a working
// session (register/login), the browser was closed, and on reopening + re-entering the same
// credentials, three things failed together (a transport error under the password field, "Code
// konnte nicht erzeugt werden." on the QR card, the Google button gone) — the signature of "the
// browser could not reach the API", not of any one screen's own logic.
//
// #295 itself named two candidate causes, and only one of them is testable by a browser gate:
//   1. The APP mishandles the return case — stale client state, a cookie that doesn't survive or
//      survives wrongly, a screen that renders from an old session. THIS FILE tests that half —
//      today it was completely untested.
//   2. The API CONTAINER died between the two sessions (no `restart:` policy, no healthcheck on
//      `api`, an eager, unbounded-memory Chromium launch at boot — docker-compose.yml/
//      pdf-renderer.playwright.ts, all read directly, none of them proven as the cause). A
//      browser gate against a stack this file itself keeps alive cannot see a container that died
//      in between — by construction, since this file never lets the API die. That half stays
//      #295's own, with its own recorded evidence-capture plan.
//
// **A green run of this file is not evidence #295 is closed.** It proves the app's own return-
// visit handling is honest when the API stays healthy. It says nothing about whether the API
// stayed healthy on the stakeholder's Mac. Do not let a green run here retire #295 — say so on
// the ticket in exactly those words.
//
// One row below (`assertLoginScreenHonest`'s `expectHealthy: false` branch, control proof A)
// DOES reproduce all three of #295's own symptom strings byte for byte, under a genuine,
// harness-induced network break (`page.route(...).abort()` against every request the BROWSER
// itself makes to `apiOrigin` — a real aborted connection at the transport layer, not a mocked
// JSON body). That is deliberate and useful: it is the calibration this file's positive
// assertions need (Musti's "prove the assertion can fail" bar) AND it shows precisely what an
// honest client does when the API truly is unreachable — the three symptoms are not a bug in
// that telling, they are the client correctly reporting reality. What it is NOT is a claim that
// this is what happened on the stakeholder's Mac; it only proves the shape a real API outage
// produces, so a future reader can compare it against whatever #295 eventually captures.
//
// THE MATRIX (Given–When–Then, against the real stack from `e2e/harness/stack.mjs`):
//   A. Fresh context, no cookies at all → the Login screen is fully honest (control proof below
//      calibrates both directions: healthy API vs. harness-broken API).
//   B. Signed in → same-tab reload → still signed in, no fallback to /login (calibrated against
//      clearing the session cookie first, which correctly DOES fall back).
//   C. Signed in → close the browser for real (a disk-backed, persistent Chromium profile, closed
//      and relaunched from the same profile dir — not `browser.newContext()`'s always-fresh,
//      in-memory jar, which would model "a fresh install", not "reopened the same browser") → the
//      same user signs back in with the same credentials. This is the stakeholder's own repro,
//      verbatim, against a live API.
//   D. Guest → same-tab reload → the guest stays honestly a guest: the SAME guest's own data
//      renders again (calibrated against clearing the guest cookie, which correctly produces a
//      NEW, empty guest identity instead).
//   E. No session at all, a direct deep link to a protected route (`/app`, no `/login` detour) →
//      today's real, observed behaviour (see the row's own comment — not what was assumed before
//      running it) rather than a guess from reading the router.
//   F. QR: a code is minted → reload → the OLD code never reappears and a genuinely NEW one
//      mints. `deviceCode` is a bearer credential (ADR-0024's own "no browser-reachable Bearer
//      token" finding #1 is the sibling control on the desktop-token half of this same code); it
//      must not survive a reload client-side. If it ever does, that is a security finding, not a
//      test result — see this row's own FAIL message.
//
// WHAT IS DELIBERATELY NOT HERE (said plainly, not hidden):
//   - No row asserts anything about the API process's own lifetime/memory/restart policy — that
//     is #295's own remaining half, out of a browser gate's reach by construction (see above).
//   - No row reproduces "close the REAL Mac Chrome app, with its own cookie-retention settings,
//     after an arbitrary real-world idle period" — row C's persistent profile is the closest a
//     headless harness can get (a real disk-backed cookie jar, closed and reopened), not a
//     perfect stand-in for a human's actual browser configuration.
//   - Row E's "what should happen" is a genuine open product question (see its own comment) —
//     this file pins today's actual behaviour as a regression guard, it does not rule on whether
//     that behaviour is the right one. That call is the stakeholder's, flagged in this PR's body.
//
// RATE-LIMIT BUDGET (same discipline as visibility-refetch.mjs/device-authorization.mjs — read
// before adding a call). This file spends, in the shared `no-trusted-ip|<path>` sign-up/sign-in
// bucket (window 10s/max 3): row B (1 sign-up + 1 sign-in), row C (1 sign-up + 2 sign-ins) — 5
// calls total, paced via `waitForBucketHeadroom` below, which only READS the real `RateLimit`
// table (never truncates it — clearing a REQ-010 control to make a gate pass was tried once
// elsewhere in this repo and reverted). Rows A/D/E/F issue no sign-up/sign-in calls at all (row
// A's control-proof login submit is aborted by the harness's own `page.route` before it ever
// reaches the server, so it spends nothing). Device-code mints (`device-code:<ip>`, window
// 60s/max 10): row A (1, real) + row C (2 — see below) + row F (2) = 5, also paced. Rows B/D/E
// deliberately run at the `s` (375px) breakpoint — the QR column only renders at `m`/`l`
// (Decision 3a) — so those three rows never touch the device-code bucket at all. Row C is the one
// exception: it runs at `l` (1280px) deliberately, because #295's own report includes the QR
// card failing, and `s` has no QR column to exercise that symptom against at all — both of its
// Login-screen mounts (session 1's initial load, session 2's reopen) mint a code and are paced
// the same way row A's does.
// If this file is ever wired into the shared `Browser gates` CI job, it should run AFTER
// `device-authorization.mjs` (or that script's own "must run last" rule needs revisiting) — not
// done in this pass; this file stands alone today, same as `device-authorization.mjs` did before
// its own wiring (see this file's own PR for the state left here).
//
// Exits non-zero on the first failed assertion — merge gate, not a report, once wired in.

import { chromium } from 'playwright-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3 } // better-auth's own built-in rule
const DEVICE_CODE_BUCKET = { windowMs: 60_000, max: 10 } // device-code-rate-limit.ts

const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts —
// same lifted-not-imported convention every other e2e script in this directory follows (this
// workspace's only devDependency is `playwright-core`).
const COPY = {
  splashSkip: 'Weiter zur App',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  loginGoogle: 'Weiter mit Google',
  loginGuest: 'Erstmal als Gast umschauen',
  errGeneric: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
  qrError: 'Code konnte nicht erzeugt werden.',
  onboardingFirstNamePlaceholder: 'Kim',
  onboardingLastNamePlaceholder: 'Yilmaz',
  onboardingSteuerIdPlaceholder: '12 345 678 901',
  onboardingWeiter: 'Weiter',
  onboardingSteuerNrLater: 'Hab ich nicht zur Hand — später',
  profilTab: 'Profil',
  cockpitTab: 'Cockpit',
  cockpitEmptyHeading: 'Noch keine Angaben.',
  cockpitLoadErrorHeading: 'Das hat nicht geklappt.',
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

// --- Rate-limit pacing — reads the real RateLimit table, never deletes a row. Same shape as
// device-authorization.mjs's own copy (not migrated to a shared harness helper in this pass —
// see e2e/harness/README.md's "Not done in this pass" section for why duplication stands today).

function readBucketByExactKey(sql, key) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key = '${key}'`)
  return parseBucketRow(row)
}

function readBucketByPrefix(sql, prefix) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key LIKE '${prefix}:%' ORDER BY "lastRequest" DESC LIMIT 1`)
  return parseBucketRow(row)
}

function parseBucketRow(row) {
  if (!row) return null
  const [countStr, lastRequestStr] = row.split('|')
  const count = Number(countStr)
  const lastRequest = Number(lastRequestStr)
  if (!Number.isFinite(count) || !Number.isFinite(lastRequest)) return null
  return { count, lastRequest }
}

async function waitForBucketHeadroom(bucket, config, label) {
  if (!bucket) return
  const elapsed = Date.now() - bucket.lastRequest
  if (bucket.count >= config.max && elapsed < config.windowMs) {
    const waitMs = config.windowMs - elapsed + 250
    console.log(`[return-visit] ${label} bucket is at ${bucket.count}/${config.max} — waiting ${waitMs}ms rather than clearing it.`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs))
  }
}

async function skipSplash(page, webOrigin) {
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

async function signUpOutOfBand(apiOrigin, webOrigin, email, password) {
  const res = await fetch(`${apiOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
}

async function completeOnboarding(page) {
  await page.getByPlaceholder(COPY.onboardingFirstNamePlaceholder).fill('Kim')
  await page.getByPlaceholder(COPY.onboardingLastNamePlaceholder).fill('Yilmaz')
  await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
  await page.getByPlaceholder(COPY.onboardingSteuerIdPlaceholder).fill('12345678901')
  await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
  await page.getByText(COPY.onboardingSteuerNrLater).click()
  await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
}

/**
 * Whether the Google button SHOULD render, asked the exact way `useSocialSignInAvailable` itself
 * asks it — a real `fetch` issued from INSIDE the page (so it is subject to whatever network
 * condition this test has put the page under, e.g. row A's control-proof break), never a
 * hardcoded `true`/`false`. Mirrors the product's own honesty rule rather than assuming it.
 */
async function googleShouldBeAvailable(page, apiOrigin) {
  return page.evaluate(async (origin) => {
    try {
      const res = await fetch(`${origin}/v1/auth/capabilities`, { credentials: 'include' })
      if (!res.ok) return false
      const body = await res.json()
      return Array.isArray(body.socialProviders) && body.socialProviders.includes('google')
    } catch {
      return false
    }
  }, apiOrigin)
}

/**
 * Row A / row C's shared assertion: does the Login screen, AS RENDERED RIGHT NOW, tell the truth
 * about whether the API is reachable? Two independently-checked surfaces (Musti's #295-adjacent
 * standard: state the exact symptom, not a summary):
 *   - the Google button's presence matches a REAL, freshly-issued capabilities probe (see
 *     `googleShouldBeAvailable` above) — never assumed from the branch's own label.
 *   - the QR column reaches a terminal state (a real rendered `user_code`, or the honest
 *     `qr.error` text) within a bounded wait — never left in `loading` forever unexamined.
 * Does NOT submit the login form — that is `assertLoginSubmitHonest` below, used only where a
 * row actually needs to attempt a sign-in (row A's control, row C's real re-login).
 */
async function assertLoginScreenHonest(page, apiOrigin, { expectHealthy, label }) {
  const googleAvailable = await googleShouldBeAvailable(page, apiOrigin)
  const googleVisible = await page.getByText(COPY.loginGoogle, { exact: true }).isVisible().catch(() => false)
  if (googleVisible !== googleAvailable) {
    fail(
      `${label}: Google button visibility (${googleVisible}) does not match the real, freshly-probed ` +
        `/v1/auth/capabilities answer (available=${googleAvailable}) — the button is either shown when the ` +
        'API cannot actually offer it, or hidden when it can (both are dishonesty, REQ-008/#295 symptom 3).',
    )
  }

  const qrErrorLocator = page.getByText(COPY.qrError, { exact: true })
  const qrCodeLocator = page.getByText(/^[A-Z0-9]{8}$/)
  await Promise.race([
    qrErrorLocator.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    qrCodeLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
  ])
  const qrErrored = await qrErrorLocator.isVisible().catch(() => false)
  const qrReady = await qrCodeLocator.first().isVisible().catch(() => false)

  if (expectHealthy) {
    if (qrErrored) fail(`${label}: QR column shows "${COPY.qrError}" against a healthy API — #295 symptom 2, reproduced when it should not be.`)
    if (!qrReady) fail(`${label}: QR column never reached a rendered user_code against a healthy API within 15s (stuck loading).`)
  } else {
    if (qrReady) fail(`${label}: QR column rendered a real user_code despite the harness's own network break — the break did not actually reach this request.`)
    if (!qrErrored) fail(`${label}: QR column never showed the honest "${COPY.qrError}" state despite the harness's own network break — an unreachable API produced no visible signal at all (worse than #295's own report, which at least surfaced this text).`)
  }
  return { googleAvailable, qrReady, qrErrored }
}

/** Submits the login form for real and asserts the password-field transport-error text matches
 *  `expectHealthy` — #295 symptom 1, the third leg alongside `assertLoginScreenHonest`'s two. */
async function assertLoginSubmitHonest(page, email, password, { expectHealthy, label }) {
  await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(password)
  await page.getByRole('button', { name: COPY.loginSubmit }).click()

  if (expectHealthy) {
    await page.waitForURL((u) => u.pathname === '/onboarding' || u.pathname === '/app', { timeout: 15_000 }).catch(() => {
      fail(`${label}: real sign-in with valid credentials against a healthy API never navigated off /login within 15s.`)
    })
    const errGenericVisible = await page.getByText(COPY.errGeneric, { exact: true }).isVisible().catch(() => false)
    if (errGenericVisible) fail(`${label}: "${COPY.errGeneric}" appeared under the password field against a healthy API and valid credentials — #295 symptom 1, reproduced when it should not be.`)
  } else {
    await page.getByText(COPY.errGeneric, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      fail(`${label}: no honest transport-error text appeared under the password field despite the harness's own network break — a submit against an unreachable API produced no visible signal at all.`)
    })
  }
}

/** Row A — fresh context, no cookies at all. Two passes: the real, healthy stack (the positive
 *  claim), then the SAME screen under a harness-induced, page-scoped network break (the control
 *  proof this file's other assertions lean on, and the one place this file deliberately
 *  reproduces #295's own three symptom strings — see this file's header for the boundary). */
async function testFreshLoginScreen(browser, apiOrigin, webOrigin) {
  // --- healthy pass ---
  const healthyCtx = await newContextAtBreakpoint(browser, 'l')
  try {
    const page = await healthyCtx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    guardAgainst429(page, fail, '/v1/device/')
    await skipSplash(page, webOrigin)
    await assertLoginScreenHonest(page, apiOrigin, { expectHealthy: true, label: 'Row A (healthy)' })
    console.log('[return-visit] Row A (healthy): fresh Login screen is fully honest — Google matches capabilities, QR reached a real user_code.')
  } finally {
    await healthyCtx.close()
  }

  // --- control proof: the browser cannot reach the API at all ---
  const brokenCtx = await newContextAtBreakpoint(browser, 'l')
  try {
    const page = await brokenCtx.newPage()
    await page.route(`${apiOrigin}/**`, (route) => route.abort('failed'))
    await skipSplash(page, webOrigin)
    await assertLoginScreenHonest(page, apiOrigin, { expectHealthy: false, label: 'Row A (control: API unreachable)' })
    await assertLoginSubmitHonest(page, 'nobody@beispiel.de', 'irrelevant-pw', { expectHealthy: false, label: 'Row A (control: API unreachable)' })
    console.log(
      '[return-visit] Row A (control): with the API genuinely unreachable, the Login screen shows exactly ' +
        "#295's three symptoms, honestly and together — this calibrates the assertions above, it does not " +
        'establish #295\'s own cause (see this file\'s header).',
    )
  } finally {
    await brokenCtx.close()
  }
}

/**
 * Reads the REAL signed-in identity from inside the page, the same way `useSession()` does —
 * `data.user.email`, or `null` if there is no better-auth session. This is the precise signal
 * Row B needs and a page render alone cannot give: `/app` has NO guard at all (`AppRoute` in
 * App.tsx renders `TabbedShell` unconditionally), and `UserContextGuard` (REQ-002) silently
 * mints a fresh, unrelated GUEST session for any request with no cookie at all — so "the tab bar
 * rendered at /app" is satisfied identically by "still the same account" and by "silently became
 * a brand-new guest", and a check that can't tell those apart proves nothing about being signed
 * in. FOUND while building this row, not assumed going in — see this file's PR body.
 */
async function getSessionEmail(page, apiOrigin) {
  return page.evaluate(async (origin) => {
    try {
      const res = await fetch(`${origin}/api/auth/get-session`, { credentials: 'include' })
      if (!res.ok) return null
      const body = await res.json().catch(() => null)
      return body?.user?.email ?? null
    } catch {
      return null
    }
  }, apiOrigin)
}

/** Row B — signed in, same-tab reload, still the SAME account signed in (checked via a real
 *  `get-session` identity read, see `getSessionEmail` above — NOT via "some screen with a tab bar
 *  rendered at /app", which a silent guest fallback satisfies identically). Calibrated against
 *  clearing the session cookie first (the negative control): that MUST clear the identity, or the
 *  positive assertion above it is meaningless. */
async function testSignedInReload(browser, apiOrigin, webOrigin, sql) {
  const ctx = await newContextAtBreakpoint(browser, 's')
  try {
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    const email = `return-visit-reload-${Date.now()}@beispiel.de`

    await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/onboarding', { timeout: 10_000 })
    await completeOnboarding(page)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 10_000 })
    await page.getByRole('tab', { name: COPY.profilTab }).waitFor({ state: 'visible', timeout: 5_000 })
    const identityAfterSignIn = await getSessionEmail(page, apiOrigin)
    if (identityAfterSignIn !== email) {
      fail(`Row B: get-session read ${JSON.stringify(identityAfterSignIn)} right after a real sign-in, expected ${email}.`)
    }
    console.log('[return-visit] Row B: signed in for real, reached /app with the tab bar visible and a real session for the right account.')

    // --- positive: reload while signed in ---
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: COPY.profilTab }).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {
      fail('Row B: reloading while signed in at /app did not show the tab bar within 5s — no honest signed-in shell rendered.')
    })
    const identityAfterReload = await getSessionEmail(page, apiOrigin)
    if (identityAfterReload !== email) {
      fail(
        `Row B (positive): after a same-tab reload at /app, get-session reads ${JSON.stringify(identityAfterReload)} ` +
          `instead of the still-signed-in account (${email}). A rendered tab bar alone does not prove this — ` +
          '/app has no guard and silently falls back to a brand-new guest on no session, which renders identically.',
      )
    }
    console.log(`[return-visit] Row B (positive): a same-tab reload while signed in keeps the SAME account's session (${email}) — checked via get-session, not just a rendered screen.`)

    // --- negative control: same page, session cookie cleared, THEN reload ---
    await ctx.clearCookies()
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const identityAfterClear = await getSessionEmail(page, apiOrigin)
    if (identityAfterClear === email) {
      fail(
        `Row B (control): clearing the session cookie and reloading STILL reads get-session identity ${email} — ` +
          'the positive assertion above cannot be trusted; it would have passed even if the cookie clear had no effect.',
      )
    }
    // NOT asserted: that this lands on /login. FOUND while building this row (not assumed going
    // in): /app has no guard, so clearing the cookie and reloading does NOT fall back to /login —
    // UserContextGuard (REQ-002) silently mints a brand-new, empty GUEST session instead, and
    // /app renders its own honest empty Cockpit under that guest identity. That is real, on-topic
    // behaviour this file did not go looking for — reported in this PR's body as its own finding,
    // not folded silently into this row's assertion (which only needs "not the same account",
    // proven above via get-session, and is honestly agnostic about which of /login or a fresh
    // guest is the right landing spot for a lost session — a product call, not this file's).
    console.log('[return-visit] Row B (control): clearing the session cookie correctly clears the account identity on reload — the positive assertion above is real, not vacuous.')
  } finally {
    await ctx.close()
  }
}

/** Row C — the stakeholder's own repro, verbatim: signed in, close the browser FOR REAL (a
 *  disk-backed, persistent Chromium profile — `browser.newContext()` would model a fresh
 *  install, not "reopened the same browser"), reopen it, sign back in with the same credentials,
 *  against a live API throughout. */
async function testCloseAndReopenReLogin(apiOrigin, webOrigin, sql) {
  const email = `return-visit-reopen-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
  await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

  const profileDir = await mkdtemp(join(tmpdir(), 'steuereule-return-visit-profile-'))
  try {
    // --- "open the browser", session 1 ---
    let ctx = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1280, height: 900 } })
    try {
      let page = ctx.pages()[0] ?? (await ctx.newPage())
      guardAgainst429(page, fail, '/api/auth/')
      guardAgainst429(page, fail, '/v1/device/')
      // `l`-breakpoint (see below) mounts the QR column, which mints a device-code row on every
      // load (Decision 3a) — paced against the shared bucket like every other mint in this file.
      await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
      await skipSplash(page, webOrigin)
      await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
      await assertLoginSubmitHonest(page, email, TEST_PASSWORD, { expectHealthy: true, label: 'Row C (session 1 sign-in)' })
      console.log('[return-visit] Row C: session 1 — real sign-in against a live API succeeded, no #295 symptom 1.')

      const cookiesBeforeClose = await ctx.cookies()
      if (!cookiesBeforeClose.some((c) => c.name.includes('session_token'))) {
        fail('Row C: no session cookie present before closing the browser — nothing to carry over to session 2, the repro would prove nothing.')
      }
    } finally {
      // --- "close the browser" — a real close of the persistent profile, flushing cookies to disk. ---
      await ctx.close()
    }
    console.log('[return-visit] Row C: browser closed for real (persistent profile flushed to disk).')

    // --- "reopen the browser", session 2 — same profile dir, new process ---
    ctx = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1280, height: 900 } })
    try {
      const cookiesAfterReopen = await ctx.cookies()
      if (!cookiesAfterReopen.some((c) => c.name.includes('session_token'))) {
        fail('Row C: the session cookie did not survive closing and reopening the persistent profile — this is a Chromium cookie-jar property, not an app one, but it breaks the repro.')
      }

      const page = ctx.pages()[0] ?? (await ctx.newPage())
      guardAgainst429(page, fail, '/api/auth/')
      guardAgainst429(page, fail, '/v1/device/')
      await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
      await skipSplash(page, webOrigin)
      // Splash always leads to Login today (App.tsx's own comment: no boot-time session-detection
      // yet, REQ-009 pending) — an already-documented gap, not asserted here as new. The
      // stakeholder's own next step is what this row actually tests: re-entering the same
      // credentials on the screen that's actually shown.
      await assertLoginScreenHonest(page, apiOrigin, { expectHealthy: true, label: 'Row C (session 2, before re-login)' })
      await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
      await assertLoginSubmitHonest(page, email, TEST_PASSWORD, { expectHealthy: true, label: 'Row C (session 2, re-login)' })
      console.log(
        '[return-visit] Row C: session 2 — after a real close+reopen of the browser, re-entering the same ' +
          "credentials against a live API succeeds cleanly, none of #295's three symptoms appear. This proves " +
          "the CLIENT side of a close/reopen/re-login cycle is honest when the API stays healthy; it says " +
          "nothing about whether the API stayed healthy on the stakeholder's own Mac (see this file's header).",
      )
    } finally {
      await ctx.close()
    }
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
}

/** Row D — guest, same-tab reload, the guest stays honestly a guest (ADR-0007: identity only at
 *  filing). Calibrated against clearing the guest cookie (negative control): that MUST produce a
 *  fresh, empty guest identity, not the same one — otherwise the positive assertion below would
 *  pass even if the guest cookie were silently ignored altogether. */
async function testGuestReload(browser, webOrigin) {
  const ctx = await newContextAtBreakpoint(browser, 's')
  try {
    const page = await ctx.newPage()
    await skipSplash(page, webOrigin)
    await page.getByText(COPY.loginGuest, { exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/onboarding', { timeout: 10_000 })
    await completeOnboarding(page)
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 10_000 })
    await page.getByRole('tab', { name: COPY.profilTab }).click()
    await page.getByText('Kim Yilmaz', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    console.log('[return-visit] Row D: guest onboarding completed, own data ("Kim Yilmaz") renders in Profil.')

    // --- positive: reload while guest ---
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    if (new URL(page.url()).pathname !== '/app') {
      fail(`Row D: reloading while guest at /app landed on ${page.url()} instead — the guest cookie did not survive a same-tab reload.`)
    }
    await page.getByRole('tab', { name: COPY.profilTab }).click()
    await page.getByText('Kim Yilmaz', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Row D (positive): reloading while guest did not re-render the SAME guest\'s own data ("Kim Yilmaz") within 10s.')
    })
    console.log('[return-visit] Row D (positive): a same-tab reload while guest re-renders the SAME guest\'s own data — the guest identity is honestly preserved.')

    // --- negative control: guest cookie cleared, THEN reload ---
    await ctx.clearCookies()
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.getByRole('tab', { name: COPY.profilTab }).click()
    const staleGuestDataStillShown = await page.getByText('Kim Yilmaz', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false)
    if (staleGuestDataStillShown) {
      fail(
        'Row D (control): clearing the guest cookie and reloading STILL shows the previous guest\'s own data ' +
          '("Kim Yilmaz") — the positive assertion above cannot be trusted; it would have passed even if the ' +
          'guest cookie were silently ignored. Also a real data-scoping concern on its own (REQ-002).',
      )
    }
    console.log('[return-visit] Row D (control): clearing the guest cookie correctly produces a fresh, empty guest identity on reload — the positive assertion above is real, not vacuous.')
  } finally {
    await ctx.close()
  }
}

/** Row E — no session at all, a direct deep link to a protected route. Pins TODAY'S REAL,
 *  OBSERVED behaviour (confirmed by actually driving the browser, not assumed from reading the
 *  router — App.tsx's `AppRoute` carries no guard at all): `/app`'s own `UserContextGuard`
 *  (REQ-002) silently mints a brand-new guest session and renders the honest, empty Cockpit —
 *  never a blank page, never a stuck spinner, never a crash. This is NOT this file's ruling that
 *  that is the *right* behaviour (silently starting a new guest identity from an arbitrary
 *  bookmark/deep link is a genuine, open product question — flagged in this PR's body, not
 *  decided here); it is a regression guard on the behaviour that exists today. */
async function testUnauthenticatedDeepLink(browser, webOrigin) {
  const ctx = await newContextAtBreakpoint(browser, 's')
  try {
    const page = await ctx.newPage()
    await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: COPY.profilTab }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Row E: a deep link to /app with no session never rendered the tab bar within 10s — either a broken shell or a genuine regression from the guest-guard fallback this row guards.')
    })
    const emptyHeadingVisible = await page.getByText(COPY.cockpitEmptyHeading, { exact: true }).isVisible().catch(() => false)
    if (!emptyHeadingVisible) {
      fail(`Row E: a deep link to /app with no session did not show the honest "${COPY.cockpitEmptyHeading}" empty state — check whether a stale/wrong Cockpit rendered instead.`)
    }
    const bodyText = await page.locator('body').innerText()
    if (bodyText.trim().length === 0) {
      fail('Row E: a deep link to /app with no session rendered an empty page body — the "leere Hülle" class this row exists to catch.')
    }
    console.log('[return-visit] Row E: a deep link straight to /app with no session renders the honest, empty guest Cockpit — no broken screen, no blank shell (today\'s real, observed behaviour).')
  } finally {
    await ctx.close()
  }
}

/** Row F — a minted device code must NOT survive a reload (it is a bearer credential, ADR-0024).
 *  A reload must mint a genuinely NEW code, and the OLD one's text must never reappear. Also
 *  checks neither the old nor the new code was ever written to `localStorage`/`sessionStorage` —
 *  `useDeviceQrCode.ts` holds it in plain `useState`, so this also stands as a regression guard
 *  against a future change accidentally persisting it client-side. */
async function testDeviceCodeDoesNotSurviveReload(browser, webOrigin, sql) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  try {
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/v1/device/')
    let firstCode
    let secondCode
    page.on('response', async (response) => {
      if (response.request().method() === 'POST' && response.url().includes('/v1/device/code') && response.status() === 201) {
        const body = await response.json().catch(() => null)
        if (!firstCode) firstCode = body
        else secondCode = body
      }
    })

    await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
    await skipSplash(page, webOrigin)
    await page.getByText(/^[A-Z0-9]{8}$/).first().waitFor({ state: 'visible', timeout: 15_000 })
    if (!firstCode) fail('Row F: no POST /v1/device/code response observed on first mount — nothing to compare against a reload.')

    await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText(/^[A-Z0-9]{8}$/).first().waitFor({ state: 'visible', timeout: 15_000 })

    if (!secondCode) fail('Row F: no second POST /v1/device/code response observed after reload — a reload did not re-mint at all (the code may be stuck showing the old one).')
    if (secondCode.deviceCode === firstCode.deviceCode || secondCode.userCode === firstCode.userCode) {
      fail(
        `Row F: SECURITY FINDING, not a test failure — the device code minted before a reload ` +
          `(userCode=${firstCode.userCode}) is IDENTICAL to the one minted after (userCode=${secondCode.userCode}). ` +
          'A deviceCode is a bearer credential (ADR-0024) and must not survive a reload client-side.',
      )
    }

    const oldCodeStillRendered = await page.getByText(firstCode.userCode, { exact: true }).isVisible().catch(() => false)
    if (oldCodeStillRendered) {
      fail(`Row F: SECURITY FINDING — the pre-reload user_code (${firstCode.userCode}) is still rendered on screen after reload, alongside or instead of the new one.`)
    }

    const storageDump = await page.evaluate(() => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    }))
    const storageText = JSON.stringify(storageDump)
    if (storageText.includes(firstCode.deviceCode) || storageText.includes(secondCode.deviceCode) || storageText.includes(firstCode.userCode) || storageText.includes(secondCode.userCode)) {
      fail(`Row F: SECURITY FINDING — a deviceCode/userCode value was found in localStorage/sessionStorage: ${storageText}. This bearer credential must live in memory only.`)
    }

    console.log(
      `[return-visit] Row F: reload correctly discarded the old code (${firstCode.userCode}) and minted a ` +
        `genuinely new one (${secondCode.userCode}); no trace of either in localStorage/sessionStorage.`,
    )
  } finally {
    await ctx.close()
  }
}

async function main() {
  const { apiOrigin, webOrigin, sql } = await startStack()
  const browser = await launchBrowser()

  try {
    await testFreshLoginScreen(browser, apiOrigin, webOrigin)
    await testSignedInReload(browser, apiOrigin, webOrigin, sql)
    await testCloseAndReopenReLogin(apiOrigin, webOrigin, sql)
    await testGuestReload(browser, webOrigin)
    await testUnauthenticatedDeepLink(browser, webOrigin)
    await testDeviceCodeDoesNotSurviveReload(browser, webOrigin, sql)
    console.log(
      '[return-visit] PASS — return-visit/re-login handling is honest against a real, healthy stack ' +
        "(rows A-F). This does NOT close #295 — see this file's own header for the exact boundary.",
    )
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[return-visit] FAIL —', error?.message ?? error)
  process.exit(1)
})
