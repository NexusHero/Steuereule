// QR-Code-Login T1 acceptance gate (#238, REQ-014, ADR-0023/0024) — Salih's task 6.
//
// *** STANDING DRAFT, run to a full PASS on PR #239 (2026-08-04, head 1dd4a5d) — still NOT wired
// into ci.yml (real, low-risk follow-up, not done in this pass). See PR #239's test-report
// comment for the run this file was proven against: 3/3 consecutive real-stack passes, Node
// 24.18.0. The polling gap this file originally found (below) is CLOSED as of Kaan's 94c5b2a. ***
//
// MUSTI'S #263 REVIEW (F2) — this file is now the real caller `sampleComputedStyleOverFrames`/
// `probeColourAtPoint` were missing: the QR column's own owl-entrance animation (moving AND, via
// `newReducedMotionContext`, static) and the approve button's own painted fill (matched AND, at
// a deliberately wrong coordinate, correctly NOT matched). See `loginOwlHeadLayer`/
// `assertOwlEntranceOpacity` below and the `probeColourAtPoint` block ahead of the approve
// click — both calibrated in both directions, not just proven to return a number.
//
// THE FLOW THIS FILE PROVES (Musti's #238 spec, restated so the code and the spec stay legible
// side by side):
//   1. Context A (desktop, `l` breakpoint, no session) opens Login → the open QR column mints a
//      real device code on mount (Decision 3a) → the rendered `user_code` is read from the DOM
//      and cross-checked against the API response that actually produced it.
//   2. Context B (phone) signs in for real with an already-verified account, then opens the
//      verification URL directly (AC-2's "already has a session" branch) → lands on
//      GeraetefreigabeScreen → the displayed browser/OS/region/time are checked against what
//      context A's own real Chromium instance actually is, not a hard-coded expectation.
//   3. B approves. A completes its own RFC 8628 poll of `POST /v1/device/token` and becomes
//      signed in — CONFIRMED, not assumed: this was this script's own original finding (below,
//      kept for provenance) and is now the thing this run exists to re-verify closed.
//   4. A's `Set-Cookie` and the matching `Session` row in Postgres are read back and checked
//      against A's own real User-Agent/IP.
//   5. From B's own device list in Profil, A's session is revoked; a subsequent request from A
//      is rejected while B's own keeps succeeding.
//
// ORIGINAL FINDING (2026-08-03, CLOSED by Kaan's 94c5b2a, confirmed closed 2026-08-04) — kept
// verbatim for provenance, not because it is still open:
//
//   Nothing in `apps/mobile-web` ever calls `POST /v1/device/token`. `useDeviceQrCode.ts` mints
//   a code on mount and arms a one-shot expiry timer; it never polls. The generated client
//   function exists and is exercised by the backend's own integration tests
//   (`apps/api/test/acceptance/req-014-device-approve-token.integration.test.ts`), but
//   `useDeviceControllerExchangeToken`/`deviceControllerExchangeToken`
//   (`packages/api-client/src/generated/device.ts`) has no caller anywhere in
//   `apps/mobile-web/src`. Concretely, today: a real user scans the QR, approves on their phone,
//   and their desktop just... keeps showing the same QR code until it expires two minutes later.
//   The approval screen's own copy already promises otherwise ("the other screen is signing in
//   now") — a promise the desktop side cannot currently keep. This is a missing wiring, not a
//   missing library: the RFC 8628 `interval` field is minted and returned by the API
//   (`DeviceCodeResponseDto.interval`) and then silently discarded by `useDeviceQrCode.ts`
//   (never even stored in `DeviceQrState`).
//
// TWO FINDINGS FROM THIS RE-RUN (2026-08-04), reported on PR #239, not worked around silently:
//   1. This script's own `AC-5 revoke` step picked the wrong device-list row (positional
//      `nth(rowCountBefore - 1)`, no ordering guarantee behind it) and once genuinely revoked
//      B's OWN current session instead of A's — a bug in THIS harness, not in the product; fixed
//      below by selecting on the absence of the "Dieses Gerät" badge instead of DOM position,
//      plus a hard guard that fails loudly if it ever happens again. See PR #239's comment for
//      the full diagnosis (traced with raw `curl`/DB reads before touching this file).
//   2. A real, non-blocking product observation: `GeraetefreigabeScreen`'s approved/"Erledigt"
//      state has no in-app affordance back to the tabbed app (`DeviceScreen`'s route is not
//      wrapped in `TabbedShell`) — closer to a deliberate device-flow terminal screen ("you may
//      close this now") than a dead end, but worth a product call on whether it should say so
//      explicitly. Routed around here via a direct `/app` navigation so the revocation mechanism
//      itself could still be proven. Not a REQ-014 blocker.
//
// RATE-LIMIT BUDGET (Musti's #238 gate spec — requirements, not suggestions):
//   1. This script MUST run LAST in its CI job. `LoginScreen`'s QR column mints a
//      `device-code:<ip>` row on every `m`/`l`-breakpoint mount (Decision 3a, no tap needed) —
//      `breakpoint-layout.mjs`'s own breakpoint sweep and `cross-origin/run.mjs`'s flows already
//      spend some of that bucket before this script gets to run, in the real `cross-origin-smoke`
//      job (see `e2e/harness/README.md`).
//   2. It paces itself against both device buckets (`device-code:<ip>`, `device-pending:<ip>`,
//      `apps/api/src/device/device-{code,pending}-rate-limit.ts`, window 60s/max 10 each) AND the
//      shared better-auth sign-up/sign-in bucket (`no-trusted-ip|<path>`, window 10s/max 3,
//      already documented by `visibility-refetch.mjs`'s header) — via `waitForBucketHeadroom`
//      below, which READS the real `RateLimit` row and never deletes it (see #3).
//   3. `guardAgainst429` fails loudly and immediately on any 429 from `/api/auth/*` or
//      `/v1/device/*`, so a bucket exhaustion is reported as its own cause, not as a mystery
//      timeout several assertions later.
//   4. Every flow's own request count is asserted exactly (`assertRequestCount`), the same
//      discipline `visibility-refetch.mjs` established (Musti's #223 review, F8): the pacer
//      absorbs a regression AT OR BELOW the cap silently, so an exact per-flow count is the only
//      thing that names a same-flow regression that a shared, job-wide bucket reading cannot.
//
// The `RateLimit` table is READ, never cleared or truncated by this file — clearing a REQ-010
// control to make a gate pass was tried once elsewhere in this repo and reverted; that
// reasoning applies here unchanged (see `e2e/visibility/visibility-refetch.mjs`'s own header).
//
// TWO BROWSER CONTEXTS, NOT TWO PAGES (Musti's #238 gate spec, #1 — see
// `e2e/harness/browser.mjs`'s `newContextAtBreakpoint` for the full reasoning): A and B are
// modelled as separate `browser.newContext()` calls with genuinely separate cookie jars. Two
// pages in one context would share a cookie jar and the whole flow would pass trivially without
// proving anything about cross-device authorization.
//
// Assumes the caller has already booted the same stack as `e2e/cross-origin/run.mjs` (real
// Postgres, the compiled API, the exported web bundle statically served, cross-origin) — this
// script attaches to it via `e2e/harness/stack.mjs`'s ATTACH mode.
//
// Exits non-zero on the first failed assertion — merge gate, not a report, once promoted out of
// draft.

import {
  launchBrowser,
  closeBrowser,
  newContextAtBreakpoint,
  newReducedMotionContext,
  guardAgainst429,
  sampleComputedStyleOverFrames,
  probeColourAtPoint,
} from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3 } // better-auth's own built-in rule
const DEVICE_CODE_BUCKET = { windowMs: 60_000, max: 10 } // device-code-rate-limit.ts
const DEVICE_PENDING_BUCKET = { windowMs: 60_000, max: 10 } // device-pending-rate-limit.ts

const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts.
const COPY = {
  splashSkip: 'Weiter zur App',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  approvalQuestion: 'Steht dieser Code gerade auf deinem Bildschirm?',
  approvalWarning:
    'Ein Code, den du per Nachricht oder Link bekommen hast, wird hier niemals bestätigt — nur ein Code, der gerade auf einem anderen Bildschirm steht.',
  contextBrowserLabel: 'Browser',
  contextOsLabel: 'Betriebssystem',
  contextRegionLabel: 'Region',
  contextTimeLabel: 'Zeitpunkt',
  unknownRegion: 'Region unbekannt',
  approveConfirm: 'Ja, das ist mein Code',
  approvedHeading: 'Erledigt',
  onboardingFirstNamePlaceholder: 'Kim',
  onboardingLastNamePlaceholder: 'Yilmaz',
  onboardingSteuerIdPlaceholder: '12 345 678 901',
  onboardingWeiter: 'Weiter',
  onboardingSteuerNrLater: 'Hab ich nicht zur Hand — später',
  profilTab: 'Profil',
  devicesSignOut: 'Abmelden',
  devicesCurrentBadge: 'Dieses Gerät',
}

// `t.color.funke` (packages/tokens/dist/theme.ts, both light/dark themes: `#c9f229`) — the
// primary-button fill `packages/ui/src/components/Button.tsx`'s `bg.primaer` uses, and what
// GeraetefreigabeScreen's "Ja, das ist mein Code" button (the default `primaer` variant) is
// painted with. `t.color.grund` (`#f4f2e9`, light theme — App.tsx mounts `ThemeProvider
// mode="light"`) is the screen background outside any card/button. Both lifted here rather than
// imported (this workspace's only devDependency is `playwright-core`, matching `COPY` above's
// own lifted-not-imported convention) — confirmed against the real rendered pixel once, see this
// file's PR record, not assumed from the source.
const FUNKE_RGB = { r: 201, g: 242, b: 41 }
const GRUND_RGB = { r: 244, g: 242, b: 233 }
const COLOUR_TOLERANCE = 4 // real screenshot encoding is exact for a flat fill; a few units of
// slack absorbs the theoretical case of a compositor/colour-profile rounding difference without
// widening enough to blur FUNKE_RGB and GRUND_RGB into each other (their channels differ by 40+).

function coloursMatch(observed, expected, tolerance = COLOUR_TOLERANCE) {
  return Math.abs(observed.r - expected.r) <= tolerance && Math.abs(observed.g - expected.g) <= tolerance && Math.abs(observed.b - expected.b) <= tolerance
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

// --- Rate-limit pacing — reads the real RateLimit table, never deletes a row. See this file's
// own header for the budget rules these implement.

/** Exact-key bucket (better-auth's own built-in rule — the key is known ahead of time, it does
 *  not depend on a per-caller IP this environment can't resolve). */
function readBucketByExactKey(sql, key) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key = '${key}'`)
  return parseBucketRow(row)
}

/** Prefix-scanned bucket (the device endpoints' keys embed Fastify's own `request.ip`, which
 *  this script cannot predict ahead of time — it reads whichever key this job's shared,
 *  unresolvable-IP address actually produced, most-recently-touched first). */
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
    console.log(`[device-authorization] ${label} bucket is at ${bucket.count}/${config.max} — waiting ${waitMs}ms rather than clearing it.`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs))
  }
}

function countRequestsTo(page, method, pathSubstring) {
  const counter = { count: 0 }
  page.on('request', (request) => {
    if (request.method() === method && request.url().includes(pathSubstring)) counter.count += 1
  })
  return counter
}

function assertRequestCount(counter, pathSubstring, expected, label) {
  if (counter.count !== expected) {
    fail(`${label}: expected exactly ${expected} request(s) to ${pathSubstring}, observed ${counter.count}.`)
  }
}

async function skipSplash(page, webOrigin) {
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

// SALIH — fixed after this run's own AC-5 finding (see PR #239 comment): better-auth's
// sign-up/email autoSignIns, which mints and persists a real `Session` row for the out-of-band
// call itself (`userAgent: 'node'`) — a phantom third row on B's OWN device list that this
// script's earlier version never accounted for. Left alone, it turns "the non-current row" into
// an ambiguous choice between two non-current rows (the phantom AND A's real one), which is
// exactly what caused this script to pick the wrong one and revoke B's OWN session by accident
// (reported, not hidden — see this file's PR comment). Revoking the phantom immediately, using
// the very session it minted (Set-Cookie from this exact response, never B's real UI cookie jar),
// keeps B's own device list to the two rows this flow actually cares about.
async function signUpOutOfBand(apiOrigin, webOrigin, email, password) {
  const res = await fetch(`${apiOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
  const body = await res.json()
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) fail('out-of-band sign-up: no Set-Cookie on the response — cannot clean up its own phantom session.')
  const revokeRes = await fetch(`${apiOrigin}/api/auth/revoke-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin, cookie: setCookie.split(';')[0] },
    body: JSON.stringify({ token: body.token }),
  })
  if (!revokeRes.ok) fail(`out-of-band sign-up: could not revoke its own phantom session (${body.token}): ${revokeRes.status} ${await revokeRes.text()}`)
}

/**
 * Derives the SAME `{ browser, os }` label `apps/mobile-web/src/screens/device/deviceContext.ts`'s
 * `parseUserAgent` would produce, from A's REAL `navigator.userAgent` — deliberately re-derived
 * at runtime rather than hard-coded, so this assertion proves "the approval screen shows what A
 * actually is" and stays correct if this script is ever run on a non-Linux/non-Chromium host,
 * rather than encoding today's CI runner's OS as an assumption. Intentionally only the two
 * branches this environment can produce (Chromium/Linux or Chromium/macOS) — the resolvable-vs-
 * unresolvable region two-branch requirement (AC-3) is proven at the unit layer
 * (`GeraetefreigabeScreen.test.tsx`, mocked UA strings); this file proves the ONE real branch a
 * real headless Chromium run can actually produce end to end.
 */
function expectedLabelFromRealUserAgent(userAgent) {
  const browser = /Chrome\//.test(userAgent) ? 'Chrome' : null
  const os = /Linux/.test(userAgent) ? 'Linux' : /Mac OS X/.test(userAgent) ? 'macOS' : /Windows NT/.test(userAgent) ? 'Windows' : null
  if (!browser || !os) {
    fail(`expectedLabelFromRealUserAgent: could not derive an expected browser/OS label from ${JSON.stringify(userAgent)} — this script's own parsing needs a new branch, not the app's.`)
  }
  return { browser, os }
}

/**
 * The QR column's `OwlMark` head/glasses layers (`DeviceQrColumn` → `OwlMark(headStyle:
 * owl.headStyle, glassesStyle: owl.glassesStyle)`, `apps/mobile-web/src/screens/LoginScreen.tsx`)
 * — the two elements `useOwlEntranceAnimation` animates `opacity: 0 → 1` on mount, one after the
 * other (head's own 380ms stage, then glasses' own 380ms stage — `Animated.sequence`), on the
 * exact screen this file's `l`-breakpoint Context A always renders (Decision 3a: the QR column
 * only exists at `m`/`l`). Located by DOM order, confirmed against a real render rather than
 * assumed: `formColumn` (whose password field carries its own `<svg>` visibility-toggle icon)
 * always renders before `DeviceQrColumn` in `LoginScreen.tsx`'s JSX, and `OwlMark`'s head/glasses
 * layers are the first two of its own three `<svg>` layers (head, glasses, lid, in that fixed
 * order, `OwlMark.tsx`) — so on this exact screen, at this exact breakpoint, they are reliably
 * `svg >> nth=1`/`nth=2`'s parents. No `data-testid` exists on `OwlMark` to select by instead.
 */
function loginOwlLayers(page) {
  return { head: page.locator('svg').nth(1).locator('xpath=..'), glasses: page.locator('svg').nth(2).locator('xpath=..') }
}

/**
 * Calibrates `sampleComputedStyleOverFrames` in both directions on the QR column's own real
 * entrance animation (Musti's #263 review, F2) — not a synthetic self-test, the exact element
 * and exact screen this gate already visits for AC-6. `expectProgress: true` samples the
 * animation running (a fresh Login mount, motion allowed); `false` samples it under
 * `newReducedMotionContext` (`useOwlEntranceAnimation.ts`: every value starts at `1`, already at
 * rest, when `reducedMotion` is true — the entrance never plays at all). An instrument proven
 * only on the "it moved" half would still pass if it silently always reported "moving" — the
 * false-negative-on-static-input case a solid-green-eye class of bug would need caught by the
 * *other* half.
 *
 * Tracks BOTH the head and glasses layers, and samples across a window wide enough to cover
 * their whole combined ~760ms (Node ↔ browser round-trip jitter between this file's own
 * `skipSplash()` returning and the first sampled frame is real, observed directly: a first
 * version of this check sampled ONLY the head layer over 8 frames — ~130ms — and flaked once in
 * four runs when that round trip alone ate more than the head stage's own 380ms, landing every
 * sample after the head had already settled at `opacity: 1`. Widening to both layers and ~90
 * frames doesn't remove the jitter; it makes the check tolerant of it, the same way this file
 * already paces against rate-limit buckets instead of assuming zero latency elsewhere).
 */
async function assertOwlEntranceOpacity(page, { expectProgress }) {
  const layers = loginOwlLayers(page)
  const [headSamples, glassesSamples] = await Promise.all([
    sampleComputedStyleOverFrames(page, layers.head, ['opacity'], 90),
    sampleComputedStyleOverFrames(page, layers.glasses, ['opacity'], 90),
  ])
  const headValues = headSamples.map((s) => Number(s.opacity))
  const glassesValues = glassesSamples.map((s) => Number(s.opacity))
  if (headValues.some(Number.isNaN) || glassesValues.some(Number.isNaN)) {
    fail(`assertOwlEntranceOpacity: sampled a non-numeric opacity — head: ${JSON.stringify(headSamples)}, glasses: ${JSON.stringify(glassesSamples)}`)
  }
  const progressed = (values) => values.some((v) => Math.abs(v - values[0]) > 0.01)
  const headProgressed = progressed(headValues)
  const glassesProgressed = progressed(glassesValues)
  if (expectProgress && !headProgressed && !glassesProgressed) {
    fail(
      `assertOwlEntranceOpacity: expected the QR column's owl entrance to PROGRESS across ${headValues.length} frames on EITHER the head or glasses layer (motion allowed), but neither moved — head: ${JSON.stringify(headValues)}, glasses: ${JSON.stringify(glassesValues)}. Either the entrance regressed to inert (the class this instrument exists to catch), or this file's own element locator drifted.`,
    )
  }
  if (!expectProgress && (headProgressed || glassesProgressed)) {
    fail(
      `assertOwlEntranceOpacity: expected the QR column's owl entrance to STAY STATIC under prefers-reduced-motion, but head and/or glasses opacity moved — head: ${JSON.stringify(headValues)}, glasses: ${JSON.stringify(glassesValues)}. Either reduced-motion stopped being honoured, or this instrument reports motion that isn't there.`,
    )
  }
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

async function main() {
  const { apiOrigin, webOrigin, sql } = await startStack()
  const browser = await launchBrowser()

  try {
    // --- Context A: desktop, wide breakpoint (QR column only renders at m/l — Decision 3a),
    // no session, ever. ---
    const contextA = await newContextAtBreakpoint(browser, 'l')
    const pageA = await contextA.newPage()
    guardAgainst429(pageA, fail, '/api/auth/')
    guardAgainst429(pageA, fail, '/v1/device/')
    const codeRequests = countRequestsTo(pageA, 'POST', '/v1/device/code')

    const codeResponsePromise = pageA.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/v1/device/code'))
    await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
    await skipSplash(pageA, webOrigin)

    // --- Musti's #263 review, F2 (moving half): sample the QR column's real owl entrance the
    // instant Login mounts, racing it against the still-in-flight device-code mint — the
    // entrance (~1.1s total) and the mint response are on comparable timescales, so sampling
    // has to happen here, not after the mint resolves, or the animation may already have
    // settled by the time this file gets to it. ---
    await assertOwlEntranceOpacity(pageA, { expectProgress: true })
    console.log('[device-authorization] sampleComputedStyleOverFrames (moving half): the QR column\'s owl entrance genuinely progresses on a real mount.')

    const codeResponse = await codeResponsePromise
    if (codeResponse.status() !== 201) fail(`POST /v1/device/code returned ${codeResponse.status()}, expected 201.`)
    const deviceCode = await codeResponse.json()
    assertRequestCount(codeRequests, '/v1/device/code', 1, 'Context A device-code mint (AC-6)')

    await pageA.getByText(deviceCode.userCode, { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
    console.log(`[device-authorization] AC-6: Context A rendered user_code ${deviceCode.userCode}, matching the API response that minted it.`)

    // --- Musti's #263 review, F2 (static half): the SAME element, SAME screen, under
    // `newReducedMotionContext` — `useOwlEntranceAnimation.ts` starts every value already at
    // rest when reduced motion is honoured, so this is a genuine second case, not a restatement
    // of the first. A short-lived third context/mint, torn down immediately after sampling —
    // paced against the same device-code bucket as everything else in this job. ---
    await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
    const contextStatic = await newReducedMotionContext(browser, { viewport: { width: 1280, height: 900 } })
    const pageStatic = await contextStatic.newPage()
    guardAgainst429(pageStatic, fail, '/v1/device/')
    try {
      await skipSplash(pageStatic, webOrigin)
      await assertOwlEntranceOpacity(pageStatic, { expectProgress: false })
      console.log('[device-authorization] sampleComputedStyleOverFrames (static half): under prefers-reduced-motion, the same entrance genuinely stays inert.')
    } finally {
      await contextStatic.close()
    }

    const aUserAgent = await pageA.evaluate(() => navigator.userAgent)
    const expectedLabel = expectedLabelFromRealUserAgent(aUserAgent)

    // --- Context B: an already-verified account, signed in for real, then opening the
    // verification URL directly (AC-2's "phone already has a session" branch). ---
    const contextB = await newContextAtBreakpoint(browser, 's')
    const pageB = await contextB.newPage()
    guardAgainst429(pageB, fail, '/api/auth/')
    guardAgainst429(pageB, fail, '/v1/device/')

    const email = `device-auth-${Date.now()}@beispiel.de`
    await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    // Pre-verified — REQ-014 describes "an account holder already signed in on their phone", not
    // a fresh unverified sign-up; verifying here keeps the flow on its own critical path instead
    // of detouring through LoginScreen's unrelated unverified-banner stage (already covered by
    // visibility-refetch.mjs) on the way to Onboarding → Profil.
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const signInRequests = countRequestsTo(pageB, 'POST', '/api/auth/sign-in/email')
    await skipSplash(pageB, webOrigin)
    await pageB.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await pageB.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await waitForBucketHeadroom(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
    await pageB.getByRole('button', { name: COPY.loginSubmit }).click()
    await pageB.getByPlaceholder(COPY.onboardingFirstNamePlaceholder).waitFor({ state: 'visible', timeout: 10_000 })
    assertRequestCount(signInRequests, '/sign-in/email', 1, 'Context B real sign-in')
    await completeOnboarding(pageB)
    console.log('[device-authorization] Context B signed in for real and completed onboarding.')

    const pendingRequests = countRequestsTo(pageB, 'GET', '/v1/device/pending')
    const pendingResponsePromise = pageB.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes('/v1/device/pending'))
    await waitForBucketHeadroom(readBucketByPrefix(sql, 'device-pending'), DEVICE_PENDING_BUCKET, 'device-pending')
    await pageB.goto(deviceCode.verificationUriComplete)
    const pendingResponse = await pendingResponsePromise
    if (pendingResponse.status() !== 200) fail(`GET /v1/device/pending returned ${pendingResponse.status()}, expected 200.`)
    const pending = await pendingResponse.json()
    assertRequestCount(pendingRequests, '/v1/device/pending', 1, 'Context B match-verification fetch')

    if (pending.userCode !== deviceCode.userCode) {
      fail(`AC-3: /v1/device/pending returned user_code ${pending.userCode}, expected A's own ${deviceCode.userCode} — B is not looking at A's request.`)
    }
    if (pending.status !== 'pending') fail(`AC-3: expected status 'pending' before approval, got ${JSON.stringify(pending.status)}.`)

    // --- AC-3: the rendered browser/OS/region/time are what A actually is, not static text. ---
    await pageB.getByText(COPY.approvalQuestion).waitFor({ state: 'visible', timeout: 5_000 })
    await pageB.getByText(COPY.approvalWarning).waitFor({ state: 'visible' })

    const browserValue = await pageB.getByText(COPY.contextBrowserLabel).locator('..').getByText(expectedLabel.browser, { exact: true }).count()
    if (browserValue < 1) fail(`AC-3: approval screen did not render browser=${expectedLabel.browser} (A's real navigator.userAgent: ${aUserAgent}).`)

    const osValue = await pageB.getByText(COPY.contextOsLabel).locator('..').getByText(expectedLabel.os, { exact: true }).count()
    if (osValue < 1) fail(`AC-3: approval screen did not render os=${expectedLabel.os} (A's real navigator.userAgent: ${aUserAgent}).`)

    // Region: CI/this environment has no public IP for Fastify's request.ip to resolve, so the
    // ONLY branch this real-stack run can honestly prove is the fail-closed "unknown" one — the
    // resolvable-country branch is the API's own RegionResolver unit tests' job, not this
    // script's (see this function's own doc comment above).
    if (pending.region !== 'unknown') {
      fail(`AC-3 region: expected the fail-closed 'unknown' sentinel in this environment (no public source IP), got ${JSON.stringify(pending.region)}.`)
    }
    const regionValue = await pageB.getByText(COPY.contextRegionLabel).locator('..').getByText(COPY.unknownRegion, { exact: true }).count()
    if (regionValue < 1) fail(`AC-3: approval screen did not render "${COPY.unknownRegion}" for the unresolved region.`)

    if (!pending.requestedAt) fail('AC-3: /v1/device/pending returned no requestedAt.')
    const requestedAgeMs = Date.now() - new Date(pending.requestedAt).getTime()
    if (requestedAgeMs < 0 || requestedAgeMs > 5 * 60_000) {
      fail(`AC-3 time: requestedAt ${pending.requestedAt} is not within a plausible 5-minute window of now.`)
    }
    console.log('[device-authorization] AC-3: approval screen renders A\'s real browser/OS, the fail-closed region sentinel, and a plausible time.')

    // --- Musti's #263 review, F2: `probeColourAtPoint`, both halves, on the real approve
    // button — a known-good coordinate (the button's own fill) and a deliberately wrong one
    // (the page background outside it), so a systematically-shifted or hard-coded-return crop
    // can't pass by coincidence. Read the button's real `boundingBox()` rather than a fixed
    // offset — a fragile literal here would defeat the point of reading the ACTUAL rendered
    // geometry. The probe point is offset from the box's top-left corner, not its centre: the
    // button's own label text sits centred and its ink-brown glyphs are NOT `FUNKE_RGB`
    // (confirmed directly — see this file's PR record), so a centre probe would fail for a
    // reason that has nothing to do with what this instrument is proving. ---
    const approveButton = pageB.getByRole('button', { name: COPY.approveConfirm })
    const approveButtonBox = await approveButton.boundingBox()
    if (!approveButtonBox) fail('probeColourAtPoint calibration: the approve button has no bounding box — not rendered?')
    const knownGoodColour = await probeColourAtPoint(pageB, approveButtonBox.x + 10, approveButtonBox.y + 10)
    if (!coloursMatch(knownGoodColour, FUNKE_RGB)) {
      fail(`probeColourAtPoint (known-good half): expected the approve button's own fill (${JSON.stringify(FUNKE_RGB)}, t.color.funke) near its corner, read ${JSON.stringify(knownGoodColour)} instead.`)
    }
    const knownWrongColour = await probeColourAtPoint(pageB, 5, 5)
    if (coloursMatch(knownWrongColour, FUNKE_RGB)) {
      fail(`probeColourAtPoint (deliberately-wrong half): the page corner (5,5) read the BUTTON's own fill colour (${JSON.stringify(knownWrongColour)}) — the crop is not position-specific (a device-pixel-ratio offset or a hard-coded return would produce exactly this).`)
    }
    if (!coloursMatch(knownWrongColour, GRUND_RGB)) {
      fail(`probeColourAtPoint (deliberately-wrong half): expected the page background (${JSON.stringify(GRUND_RGB)}, t.color.grund) at (5,5), read ${JSON.stringify(knownWrongColour)} instead.`)
    }
    console.log('[device-authorization] probeColourAtPoint: reads the approve button\'s real painted fill, and correctly does NOT read it at an unrelated coordinate.')

    // --- Approve. `device.service.ts#approve` calls no `consume*RateLimit` at all (checked
    // directly — unlike requestCode/getPending, approve() has no db-rate-limit guard), so there
    // is no bucket to pace against here; nothing to wait for before this click. ---
    const approveRequests = countRequestsTo(pageB, 'POST', '/v1/device/approve')
    const approveResponsePromise = pageB.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/v1/device/approve'))
    await approveButton.click()
    const approveResponse = await approveResponsePromise
    if (approveResponse.status() !== 200) fail(`POST /v1/device/approve returned ${approveResponse.status()}, expected 200.`)
    assertRequestCount(approveRequests, '/v1/device/approve', 1, 'Context B approval')
    await pageB.getByText(COPY.approvedHeading).waitFor({ state: 'visible', timeout: 5_000 })
    console.log('[device-authorization] AC-5 (approval half): B approved via one tap; the approved confirmation renders.')

    // --- FINDING (see this file's header): nothing polls POST /v1/device/token from the
    // frontend, so this assertion is expected to fail today. Written honestly rather than
    // softened — see the header block for the full report. `deviceCode.interval` is the RFC 8628
    // client-poll cadence the API itself hands back; the timeout below gives a hypothetical
    // future poller several cycles of it plus slack, not an arbitrary number. ---
    const pollTimeoutMs = (Number(deviceCode.interval || 5) * 4 + 15) * 1000
    try {
      await pageA.waitForURL((url) => url.pathname === '/app' || url.pathname === '/onboarding', { timeout: pollTimeoutMs })
    } catch {
      fail(
        'AC-5 (the desktop-signs-in half) / REQ-014: Context A never became signed in within ' +
          `${pollTimeoutMs}ms of B's approval. This is the reported gap, not a flake — ` +
          'apps/mobile-web/src/auth/useDeviceQrCode.ts never calls POST /v1/device/token, so ' +
          "nothing on the desktop side ever learns the code was approved. See this file's header " +
          'comment for the full finding and repro.',
      )
    }
    console.log('[device-authorization] AC-5: Context A completed its own poll and is signed in.')

    // --- Everything below is unreachable until the finding above is fixed; written now so the
    // acceptance criterion is complete and ready, not because it has been run to a verdict. ---

    const aCookies = await contextA.cookies(apiOrigin)
    const sessionCookie = aCookies.find((c) => c.httpOnly)
    if (!sessionCookie) fail('Post-poll: Context A has no httpOnly session cookie on the API origin.')
    const sessionToken = decodeURIComponent(sessionCookie.value).split('.').slice(0, -1).join('.')
    const sessionRow = sql(`SELECT "ipAddress", "userAgent" FROM "Session" WHERE token = '${sessionToken}'`)
    if (!sessionRow) fail(`Post-poll: no Session row found for A's own token.`)
    const [sessionIp, sessionUserAgent] = sessionRow.split('|')
    if (!sessionUserAgent || !sessionUserAgent.includes('Chrome/')) {
      fail(`Post-poll: Session.userAgent (${JSON.stringify(sessionUserAgent)}) does not reflect A's real Chromium User-Agent.`)
    }
    console.log(`[device-authorization] Post-poll: Session row for A carries ipAddress=${sessionIp}, a real Chromium userAgent.`)

    // --- NEW FINDING (2026-08-04 T1 re-run, not the polling gap — that one is now CLOSED): the
    // approved confirmation screen (`GeraetefreigabeScreen`'s `approved` branch, above) is a real
    // dead end. `DeviceScreen`'s `/device` route is NOT wrapped in `TabbedShell` (see App.tsx:
    // only `AppRoute` mounts `TabbedShell`/the tab bar) — after B approves, B sees "Erledigt" with
    // no button, link, or tab bar back into the app. B's browser back button has nothing useful to
    // go to either (this script's own `pageB.goto(deviceCode.verificationUriComplete)` is a fresh
    // navigation, exactly what tapping a real QR/link on a phone does — there is no prior in-app
    // history to go back to). Manually confirmed: a signed-in user who types/bookmarks `/app`
    // directly DOES land in Cockpit with the tab bar (session cookie alone gates nothing on that
    // route) — so the session and the tab bar both work, there is just no AFFORDANCE from this
    // screen to reach them. REQ-014's own acceptance text requires sessions to be "individually
    // listed and revocable from Profil" — reachable in principle, but only by a user who thinks to
    // hand-edit the URL, which is not a real affordance. Routed around below (`pageB.goto(webOrigin
    // + '/app')`) so the revocation mechanism itself can still be proven; the missing affordance is
    // reported to Musti/Kaan as its own, separate finding — see this run's PR comment.
    await pageB.goto(`${webOrigin}/app`)
    await pageB.getByRole('tab', { name: COPY.profilTab }).waitFor({ state: 'visible', timeout: 5_000 })

    // --- AC-5 (the revocation half): from B's own device list, revoke A's session; A's next
    // request is rejected while B's own keeps succeeding. ---
    await pageB.getByRole('tab', { name: COPY.profilTab }).click()
    await pageB.getByText(COPY.devicesSignOut).first().waitFor({ state: 'visible', timeout: 5_000 })
    // FIXED after this run's own finding (see PR #239 comment): a single `.locator('..')` from
    // the "Abmelden" text lands on the Chip's own inner wrapper, NOT `DeviceListSection.tsx`'s
    // `deviceRow` View — "Dieses Gerät" is a SIBLING of the Chip inside `deviceRow`, two DOM
    // levels up, not an ancestor of the Chip itself. The old single-level scope silently never
    // saw the badge at all, for EITHER row — confirmed empirically (`xpath=../..`, verified
    // against a real render, contains exactly one row's Browser/OS/lastActive/badge/Abmelden
    // text and nothing from its neighbour).
    const rows = pageB.locator('text=' + COPY.devicesSignOut).locator('xpath=../..')
    const rowCountBefore = await rows.count()
    if (rowCountBefore !== 2) fail(`AC-5 revoke: expected exactly 2 device rows (B's own + A's QR-authorized one), found ${rowCountBefore}.`)

    // The non-current row is A's — B's own carries the "Dieses Gerät" badge. FIXED after this
    // run's own finding (see PR #239 comment): the earlier version picked the row by DOM
    // POSITION (`nth(rowCountBefore - 1)`), on the unstated assumption that the device list
    // renders newest-first-or-last in a stable, predictable order. It does not — `listSessions()`
    // carries no documented ordering guarantee this screen relies on, and in a live run it put
    // B's OWN row last, not A's — the earlier script clicked the wrong "Abmelden", revoked B's
    // own current session, and got B redirected straight to `/login`
    // (`DeviceListSection.tsx`'s `onCurrentSessionRevoked` firing `ProfilScreen`'s `onSignedOut`
    // exactly as designed for a self-revoke — the MECHANISM is correct, my SELECTOR was wrong).
    // Selecting by the ABSENCE of the "Dieses Gerät" badge is order-independent and matches what
    // a real human does (reads the badge, not row position).
    const currentBadgeCount = await pageB.getByText(COPY.devicesCurrentBadge).count()
    if (currentBadgeCount !== 1) fail(`AC-5 revoke: expected exactly one row marked "${COPY.devicesCurrentBadge}", found ${currentBadgeCount}.`)

    const nonCurrentRow = rows.filter({ hasNotText: COPY.devicesCurrentBadge })
    if ((await nonCurrentRow.count()) !== 1) {
      fail(`AC-5 revoke: expected exactly 1 non-current device row (A's), found ${await nonCurrentRow.count()}.`)
    }
    await nonCurrentRow.getByText(COPY.devicesSignOut).click()
    await pageB.waitForTimeout(1_000)

    // A hard guard against the exact class of accident this run caught: if B's own session got
    // revoked instead of A's, B is redirected to /login by `onSignedOut` — assert that did NOT
    // happen, so a regression of THIS bug fails loudly here rather than surfacing as the
    // downstream "B's own session stopped working" assertion a few lines down (same root cause,
    // worse message).
    if (new URL(pageB.url()).pathname === '/login') {
      fail("AC-5 revoke: Context B was redirected to /login after the revoke click — B's OWN current session was revoked, not A's. This is the exact wrong-row-selection class this script itself hit; see this file's comment above.")
    }

    const aSessionCheck = await pageA.evaluate(
      async (origin) => {
        const res = await fetch(`${origin}/api/auth/get-session`, { credentials: 'include' })
        const body = await res.json().catch(() => null)
        return { status: res.status, session: body }
      },
      apiOrigin,
    )
    if (aSessionCheck.session?.session) {
      fail(`AC-5 revoke: Context A's session is still accepted after B revoked it from the device list (get-session status ${aSessionCheck.status}).`)
    }

    const bSessionCheck = await pageB.evaluate(
      async (origin) => {
        const res = await fetch(`${origin}/api/auth/get-session`, { credentials: 'include' })
        const body = await res.json().catch(() => null)
        return { status: res.status, session: body }
      },
      apiOrigin,
    )
    if (!bSessionCheck.session?.session) {
      fail(`AC-5 revoke: Context B's OWN session stopped working after revoking A's — over-broad revoke (status ${bSessionCheck.status}).`)
    }
    console.log("[device-authorization] AC-5: revoking A's session from B's device list rejects A's next request while B's own keeps succeeding.")

    console.log('[device-authorization] PASS — full REQ-014 round trip proven against the real stack.')
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[device-authorization] FAIL —', error?.message ?? error)
  process.exit(1)
})
