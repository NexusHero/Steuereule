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
// A NOTE ON TIMING, left visible rather than smoothed over: #298 (the LoginScreen/Registrierung
// DS-alignment slice) merged to `main` while this PR was in review — its own AC-A directly
// redesigns the exact failure shape #295 reported: a genuine, transport-level outage now shows
// ONE shared banner ("Gerade nicht erreichbar — das liegt an uns."), and the Google slot and the
// QR column both DEFER to it (an honest "can't tell"/"retrying" line each) instead of each
// raising independent prose. #295's own three original strings (a password-field `auth.errGeneric`,
// the QR card's `"Code konnte nicht erzeugt werden."`, a silently-missing Google button) are no
// longer what the OUTAGE codepath produces — this file was rebased onto `main` post-merge and its
// assertions rewritten against the REAL current contract, not the one #295 was filed against.
// Narrower than it sounds: both strings still render on this same screen for a DIFFERENT cause —
// `login.qr.error` for a genuine, non-outage QR-only failure (`LoginScreen.tsx`'s own `error`
// branch, reached only when `!apiUnreachable`), `auth.errGeneric` for a Google social-sign-in
// failure (`LoginScreen.tsx`'s `googleSignIn()`, covered by `LoginScreen.test.tsx`). Neither of
// those is the outage case this file's own rows construct or assert on.
//
// One row below (`assertLoginScreenHonest`'s `expectHealthy: false` branch, control proof A) DOES
// reproduce this CONSOLIDATED failure shape, under a genuine, harness-induced network break
// (`page.route(...).abort()` against every request the BROWSER itself makes to `apiOrigin` — a
// real aborted connection at the transport layer, not a mocked JSON body). That is deliberate and
// useful: it is the calibration this file's positive assertions need (Musti's "prove the
// assertion can fail" bar) AND it confirms AC-A's own consolidation actually holds under a real
// break, not just in the source. What it is NOT is a claim that #295's own incident looked like
// this — #295 was filed against the OLD, three-message screen, and nobody has confirmed the API
// was even the same kind of unreachable on the stakeholder's Mac. This row shows what an honest
// client does today when the API truly is unreachable; it is evidence the bug CLASS is fixed, not
// evidence about the specific incident.
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
//   G. Not part of the stakeholder's own matrix — a harness-instrument repair (Musti's F10 on
//      #298, see this file's own PR body). SplashScreen's own entrance animation, which every row
//      above already visits on every fresh context, sampled both moving (a real load) and static
//      (forced reduced motion) — the same real-caller obligation ADR-0021/#263's F2 already
//      established for `sampleComputedStyleOverFrames`/`newReducedMotionContext`, now pointed at
//      a target #298 does not touch (LoginScreen's own owl, their prior caller, is what #298 drops).
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
// calls total, paced via `waitForBucketHeadroom` (`../harness/rate-limit.mjs`, imported above),
// which only READS the real `RateLimit` table (never truncates it — clearing a REQ-010 control
// to make a gate pass was tried once elsewhere in this repo and reverted). Rows A/D/E/F issue no
// sign-up/sign-in calls at all (row A's control-proof login submit is aborted by the harness's
// own `page.route` before it ever reaches the server, so it spends nothing). Device-code mints
// (`device-code:<ip>`, window 60s/max 10): row A (1, real) + row C (2 — see below) + row F (2) =
// 5, also paced. Rows B/D/E deliberately run at the `s` (375px) breakpoint — the QR column only
// renders at `m`/`l` (Decision 3a) — so those three rows never touch the device-code bucket at
// all. Row C is the one exception: it runs at `l` (1280px) deliberately, because #295's own
// report includes the QR card failing, and `s` has no QR column to exercise that symptom against
// at all — both of its Login-screen mounts (session 1's initial load, session 2's reopen) mint a
// code and are paced the same way row A's does.
//
// WIRED into `ci.yml`'s `Browser gates` job (Musti's #300 review, G1 — a repair instrument with
// no real caller in CI is the same defect one level up, so this did not stay a standing-alone
// draft the way `device-authorization.mjs` once did). Runs as the job's LAST step, after
// `device-authorization.mjs`. That ordering is NOT "device-authorization.mjs's own script header
// requires strictly-last" — read closely (Musti's #300 review), its actual constraint is "after
// every gate that consumes the device-code bucket WITHOUT pacing itself" — `breakpoint-layout.mjs`
// and `banner-ds-qa.mjs`, neither of which calls a device-code endpoint at all, so neither paces
// against THAT bucket (`banner-ds-qa.mjs` now does call `waitForBucketHeadroom` — as of the #336
// CI investigation, Salih — but only against the sign-up/sign-in bucket it actually spends; it
// still mints no device code, so this ordering constraint is unchanged).
// This file and `device-authorization.mjs` both self-pace via the same shared helper, so their
// order relative to EACH OTHER doesn't matter for correctness — whichever runs second simply
// waits out whatever bucket state the first left behind, exactly as designed. This file runs
// after `device-authorization.mjs` for the simplest reason available (least risk to an existing,
// proven step), not because ordering between two self-pacing scripts is load-bearing.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

import { chromium } from 'playwright-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429, sampleComputedStyleOverFrames, newReducedMotionContext } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, readBucketByExactKey, readBucketByPrefix, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand, completeOnboarding } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3 } // better-auth's own built-in rule
const DEVICE_CODE_BUCKET = { windowMs: 60_000, max: 10 } // device-code-rate-limit.ts

const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts —
// same lifted-not-imported convention every other e2e script in this directory follows (this
// workspace's only devDependency is `playwright-core`). The splash/login/onboarding/profil keys
// live in `FLOW_COPY` (`../harness/flows.mjs`, Musti's #331 review, F6) alongside the drive
// sequences that read them — spread in here so every existing `COPY.xyz` call site below keeps
// working unchanged; only the screen-specific strings below are this file's own.
const COPY = {
  ...FLOW_COPY,
  loginGoogle: 'Weiter mit Google',
  loginGuest: 'Erstmal als Gast umschauen',
  // #283/#298 AC-A (landed on `main` while this file was in review, see this file's own PR
  // thread) — a genuine, transport-level API outage now shows exactly ONE shared alert, not
  // three independent messages. This directly closes the bug CLASS #295 reported (three
  // confusing, uncorrelated failures); it is not #295 itself (see this file's header). The old
  // per-surface strings this COPY block used to carry (a password-field `auth.errGeneric`, a QR
  // `login.qr.error`) are gone from the OUTAGE codepath — AC-A suppresses both in favour of the
  // one banner below, and every row in this file that touches an outage now asserts THAT
  // consolidation, not the three old strings independently. Both strings still render on this
  // same screen for a genuinely different, non-outage cause (`login.qr.error` for a QR-only
  // failure against a reachable API, `auth.errGeneric` for a Google social-sign-in failure) — see
  // this file's own header for the exact statement; neither is what this file's rows construct.
  apiUnreachableHeading: 'Gerade nicht erreichbar — das liegt an uns.',
  googleUnknown: 'Wir können gerade nicht prüfen, ob Google verfügbar ist.',
  qrRetryingAuto: 'Wir versuchen es automatisch erneut …',
  qrRetryExhausted: 'Die automatischen Versuche sind pausiert — bitte versuch es manuell noch einmal.',
  cockpitTab: 'Cockpit',
  cockpitEmptyHeading: 'Noch keine Angaben.',
  cockpitLoadErrorHeading: 'Das hat nicht geklappt.',
}

// Rate-limit pacing (`fail`, `readBucketByExactKey`, `readBucketByPrefix`,
// `waitForBucketHeadroom`) is imported from `../harness/rate-limit.mjs` — the one canonical copy
// this file and `device-authorization.mjs` both migrated onto together (Musti's #300 review, G2;
// see that module's own header for why the two prior byte-identical copies were a real problem,
// not a style nit). `waitForRateLimit` below is a thin, script-local wrapper that supplies this
// file's own `scriptTag` so every call site doesn't have to repeat it.
function waitForRateLimit(bucket, config, label) {
  return waitForBucketHeadroom(bucket, config, label, 'return-visit')
}

// `skipSplash`, `signUpOutOfBand`, `completeOnboarding` are imported from `../harness/flows.mjs`
// above (Musti's #331 review, F6) — this file and `storage/no-client-persistence.mjs` are its two
// real callers as of the same change that introduced it.

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
 * about whether the API is reachable? Rewritten against the real, current contract (AC-A/#283,
 * #298 — landed on `main` mid-review; see this file's header for the note on that): a genuine
 * outage shows exactly ONE shared banner naming the cause, and every other surface DEFERS to it
 * instead of raising its own prose. Three checks, each on its own surface:
 *   - the shared outage banner (`apiUnreachableHeading`) is present iff `expectHealthy` is false
 *     — never up against a healthy API, never silent against a genuinely broken one.
 *   - the Google slot: `loginGoogle` (the real button) when the API is healthy AND a real,
 *     freshly-issued in-page capabilities probe says available (see `googleShouldBeAvailable`
 *     above — never assumed from the branch's own label); `googleUnknown` (the honest "can't
 *     tell" fallback, not silence) once the banner is up.
 *   - the QR column reaches a terminal state within a bounded wait: a real rendered `user_code`
 *     when healthy, or the deferred `qrRetryingAuto`/`qrRetryExhausted` text when not (never the
 *     old, now-retired `login.qr.error` string — that copy only shows for a NON-outage QR-only
 *     failure, a case this row does not construct).
 * Does NOT submit the login form — that is `assertLoginSubmitHonest` below, used only where a
 * row actually needs to attempt a sign-in (row A's control, row C's real re-login).
 */
async function assertLoginScreenHonest(page, apiOrigin, { expectHealthy, label }) {
  const bannerLocator = page.getByText(COPY.apiUnreachableHeading, { exact: true })
  const qrCodeLocator = page.getByText(/^[A-Z0-9]{8}$/)
  const qrDeferredLocator = page.getByText(COPY.qrRetryingAuto, { exact: true }).or(page.getByText(COPY.qrRetryExhausted, { exact: true }))
  await Promise.race([
    qrCodeLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    qrDeferredLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
  ])

  const bannerVisible = await bannerLocator.isVisible().catch(() => false)
  if (bannerVisible !== !expectHealthy) {
    fail(
      `${label}: the shared outage banner ("${COPY.apiUnreachableHeading}") visibility is ${bannerVisible}, ` +
        `expected ${!expectHealthy} — either it is up against a healthy API (a false alarm), or silent against ` +
        'a genuinely unreachable one (AC-A/#283 — exactly the class #295 reported, now supposed to be fixed).',
    )
  }

  const googleAvailable = await googleShouldBeAvailable(page, apiOrigin)
  const googleButtonVisible = await page.getByText(COPY.loginGoogle, { exact: true }).isVisible().catch(() => false)
  const googleUnknownVisible = await page.getByText(COPY.googleUnknown, { exact: true }).isVisible().catch(() => false)
  if (expectHealthy) {
    if (googleButtonVisible !== googleAvailable) {
      fail(
        `${label}: Google button visibility (${googleButtonVisible}) does not match the real, freshly-probed ` +
          `/v1/auth/capabilities answer (available=${googleAvailable}) against a healthy API.`,
      )
    }
    if (googleUnknownVisible) fail(`${label}: the "${COPY.googleUnknown}" fallback is showing against a healthy API — it should only appear once the outage banner is up.`)
  } else {
    if (googleButtonVisible) fail(`${label}: the real Google button rendered despite the harness's own network break — an affordance that cannot work must not show (REQ-008).`)
    if (!googleUnknownVisible) fail(`${label}: neither the real Google button nor the honest "${COPY.googleUnknown}" fallback rendered despite the outage banner being up — Google went silent instead of deferring honestly.`)
  }

  const qrReady = await qrCodeLocator.first().isVisible().catch(() => false)
  const qrDeferred = await qrDeferredLocator.first().isVisible().catch(() => false)
  if (expectHealthy) {
    if (qrDeferred) fail(`${label}: QR column shows the deferred outage copy against a healthy API.`)
    if (!qrReady) fail(`${label}: QR column never reached a rendered user_code against a healthy API within 15s (stuck loading).`)
  } else {
    if (qrReady) fail(`${label}: QR column rendered a real user_code despite the harness's own network break — the break did not actually reach this request.`)
    if (!qrDeferred) fail(`${label}: QR column never showed the deferred "${COPY.qrRetryingAuto}"/"${COPY.qrRetryExhausted}" state despite the outage banner being up — it raised its own prose instead of deferring (AC-A).`)
  }
  return { googleAvailable, qrReady, bannerVisible }
}

/** Submits the login form for real and asserts the shared outage banner's presence matches
 *  `expectHealthy` — AC-A's whole point is that a transport failure on THIS specific submit path
 *  produces the exact same one banner the QR/Google surfaces already deferred to, not a second,
 *  independent password-field message (the old per-surface `auth.errGeneric` text this codepath
 *  used to set is gone — `LoginScreen.tsx`'s `login()` now sets `formTransportError` instead, and
 *  the password field's own `fehler` is suppressed to `''` for as long as the banner is up). */
async function assertLoginSubmitHonest(page, email, password, { expectHealthy, label }) {
  await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(password)
  await page.getByRole('button', { name: COPY.loginSubmit }).click()

  if (expectHealthy) {
    await page.waitForURL((u) => u.pathname === '/onboarding' || u.pathname === '/app', { timeout: 15_000 }).catch(() => {
      fail(`${label}: real sign-in with valid credentials against a healthy API never navigated off /login within 15s.`)
    })
    const bannerVisible = await page.getByText(COPY.apiUnreachableHeading, { exact: true }).isVisible().catch(() => false)
    if (bannerVisible) fail(`${label}: the shared outage banner appeared against a healthy API and valid credentials.`)
  } else {
    await page.getByText(COPY.apiUnreachableHeading, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      fail(`${label}: no honest outage banner appeared despite the harness's own network break — a submit against an unreachable API produced no visible signal at all.`)
    })
  }
}

/** Row A — fresh context, no cookies at all. Two passes: the real, healthy stack (the positive
 *  claim), then the SAME screen under a harness-induced, page-scoped network break (the control
 *  proof this file's other assertions lean on, and the one place this file confirms AC-A's
 *  consolidated-outage banner actually holds under a real transport failure — see this file's
 *  header for exactly what that does and doesn't say about #295). */
async function testFreshLoginScreen(browser, apiOrigin, webOrigin) {
  // --- healthy pass ---
  const healthyCtx = await newContextAtBreakpoint(browser, 'l')
  try {
    const page = await healthyCtx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    guardAgainst429(page, fail, '/v1/device/')
    await skipSplash(page, webOrigin)
    await assertLoginScreenHonest(page, apiOrigin, { expectHealthy: true, label: 'Row A (healthy)' })
    console.log('[return-visit] Row A (healthy): fresh Login screen is fully honest — no outage banner, Google matches capabilities, QR reached a real user_code.')
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
      '[return-visit] Row A (control): with the API genuinely unreachable, the Login screen shows the ONE ' +
        'shared outage banner, and Google/QR both defer to it instead of raising their own prose (AC-A) — ' +
        "this calibrates the assertions above, it does not establish #295's own cause (see this file's header).",
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

    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    await skipSplash(page, webOrigin)
    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
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
    // /app renders its own empty Cockpit under that guest identity — NOT called "honest" here
    // (Musti's #300 review, G3): a blank Cockpit is indistinguishable from "your data is gone",
    // which is an honesty defect, not a display of one. Reported in this PR's body as its own
    // finding, not folded silently into this row's assertion (which only needs "not the same
    // account", proven above via get-session, and is agnostic about which of /login or a fresh
    // guest is the right landing spot for a lost session — a product call, not this file's; see
    // Row E's own header for the exact question this raises for the stakeholder).
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
  await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
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
      await waitForRateLimit(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
      await skipSplash(page, webOrigin)
      await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
      await assertLoginSubmitHonest(page, email, TEST_PASSWORD, { expectHealthy: true, label: 'Row C (session 1 sign-in)' })
      console.log('[return-visit] Row C: session 1 — real sign-in against a live API succeeded, no outage banner.')

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
      await waitForRateLimit(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
      await skipSplash(page, webOrigin)
      // Splash always leads to Login today (App.tsx's own comment: no boot-time session-detection
      // yet, REQ-009 pending) — an already-documented gap, not asserted here as new. The
      // stakeholder's own next step is what this row actually tests: re-entering the same
      // credentials on the screen that's actually shown.
      await assertLoginScreenHonest(page, apiOrigin, { expectHealthy: true, label: 'Row C (session 2, before re-login)' })
      await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
      await assertLoginSubmitHonest(page, email, TEST_PASSWORD, { expectHealthy: true, label: 'Row C (session 2, re-login)' })
      console.log(
        '[return-visit] Row C: session 2 — after a real close+reopen of the browser, re-entering the same ' +
          'credentials against a live API succeeds cleanly, no outage banner, no dishonest Google/QR state. ' +
          'This proves the CLIENT side of a close/reopen/re-login cycle is honest when the API stays healthy; ' +
          "it says nothing about whether the API stayed healthy on the stakeholder's own Mac (see this file's header).",
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
 *  (REQ-002) silently mints a brand-new guest session and renders the empty Cockpit — never a
 *  blank page, never a stuck spinner, never a crash.
 *
 *  Musti's ruling (#300 review): this is NOT a confidentiality hole — the new guest sees nothing
 *  of anyone else's — but it IS an honesty defect, and this file does not call it "honest"
 *  anywhere below. A blank Cockpit is indistinguishable from "your data is gone"; nothing on
 *  screen tells whoever is looking at it that they are no longer the identity they were a moment
 *  ago. The open question for the stakeholder is not "should /app redirect to /login" — it is
 *  whether the app may EVER silently replace a known account identity with a fresh anonymous one
 *  without telling the user. T1, the stakeholder decides, ticketed separately. This row stays
 *  exactly as written either way: a regression guard on today's actual behaviour, not a ruling
 *  that the behaviour is right. */
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
      fail(`Row E: a deep link to /app with no session did not show the expected "${COPY.cockpitEmptyHeading}" empty state — check whether a stale/wrong Cockpit rendered instead.`)
    }
    const bodyText = await page.locator('body').innerText()
    if (bodyText.trim().length === 0) {
      fail('Row E: a deep link to /app with no session rendered an empty page body — the "leere Hülle" class this row exists to catch.')
    }
    console.log(
      '[return-visit] Row E: a deep link straight to /app with no session renders the empty guest Cockpit — ' +
        "no broken screen, no blank shell (today's real, observed behaviour; NOT a ruling that silently " +
        'replacing a known identity with a fresh anonymous one is honest — see this row\'s own header).',
    )
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

    await waitForRateLimit(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
    await skipSplash(page, webOrigin)
    await page.getByText(/^[A-Z0-9]{8}$/).first().waitFor({ state: 'visible', timeout: 15_000 })
    if (!firstCode) fail('Row F: no POST /v1/device/code response observed on first mount — nothing to compare against a reload.')

    await waitForRateLimit(readBucketByPrefix(sql, 'device-code'), DEVICE_CODE_BUCKET, 'device-code')
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

/**
 * Locates SplashScreen's own OwlMark layers (head, glasses — the two `sampleComputedStyleOverFrames`
 * needs; the blink/lid stage is the LAST beat and not needed to prove the entrance progresses at
 * all). SplashScreen is the ONLY thing on this page with an `<svg>` (unlike LoginScreen, which
 * also has a password-field visibility-toggle icon ahead of its own owl in DOM order —
 * `device-authorization.mjs`'s own `loginOwlLayers` offsets by one for that reason), so here
 * `svg >> nth=0`/`nth=1` are reliably head/glasses — confirmed against a real render, not assumed
 * from source (see this row's own PR evidence).
 */
function splashOwlLayers(page) {
  return { head: page.locator('svg').nth(0).locator('xpath=..'), glasses: page.locator('svg').nth(1).locator('xpath=..') }
}

function opacityProgressed(samples) {
  const values = samples.map((s) => Number(s.opacity))
  return values.some((v) => Math.abs(v - values[0]) > 0.01)
}

/**
 * Row G — repairs Musti's F10 finding on #298: `sampleComputedStyleOverFrames`/
 * `newReducedMotionContext` (`e2e/harness/browser.mjs`) lost their only real caller when #298
 * dropped the owl from LoginScreen's QR column (a real design change, not a bug — the DS's own
 * `AuthGeraete.jsx` reference puts a static brand mark there instead) — `device-authorization.mjs`
 * removed its own `assertOwlEntranceOpacity` in the same PR (`ede1749`), correctly: an assertion
 * with no element left to assert against is dead code, not a weakened check. That reopened
 * exactly the gap ADR-0021/#263's review (F2) had closed once already: an instrument with no real
 * caller is unproven.
 *
 * Rewired here, not deleted, to a DIFFERENT, durable target: SplashScreen's own entrance (its own
 * local `Animated.Value` sequence — confirmed directly, never the extracted hook the QR column
 * had borrowed, see `device-authorization.mjs`'s own header for the correction on that exact
 * point), which every row above already visits on every fresh context via `skipSplash` and which
 * no Login-screen redesign touches. Same both-directions calibration `assertOwlEntranceOpacity`
 * used: `expectProgress: true` on a genuine load (motion allowed), `expectProgress: false` under
 * `newReducedMotionContext` (SplashScreen's own `if (reducedMotion || hasPlayed.current) return`
 * — every value starts at 1, already at rest).
 */
async function testSplashEntranceReplaysHonestly(browser, webOrigin) {
  const normalCtx = await newContextAtBreakpoint(browser, 's')
  try {
    const page = await normalCtx.newPage()
    await page.goto(webOrigin, { waitUntil: 'networkidle' })
    const layers = splashOwlLayers(page)
    const [headSamples, glassesSamples] = await Promise.all([
      sampleComputedStyleOverFrames(page, layers.head, ['opacity'], 90),
      sampleComputedStyleOverFrames(page, layers.glasses, ['opacity'], 90),
    ])
    if (!opacityProgressed(headSamples) && !opacityProgressed(glassesSamples)) {
      fail(
        'Row G: Splash entrance did not progress across 90 real animation frames on a fresh load ' +
          "(motion allowed) — either the entrance regressed to inert, or this row's own locator drifted.",
      )
    }
    console.log("[return-visit] Row G (moving half): Splash's own brand entrance genuinely progresses on a fresh visit — sampleComputedStyleOverFrames repaired with a real, durable caller.")
  } finally {
    await normalCtx.close()
  }

  const reducedCtx = await newReducedMotionContext(browser, { viewport: { width: 375, height: 812 } })
  try {
    const page = await reducedCtx.newPage()
    await page.goto(webOrigin, { waitUntil: 'networkidle' })
    const layers = splashOwlLayers(page)
    const [headSamples, glassesSamples] = await Promise.all([
      sampleComputedStyleOverFrames(page, layers.head, ['opacity'], 90),
      sampleComputedStyleOverFrames(page, layers.glasses, ['opacity'], 90),
    ])
    if (opacityProgressed(headSamples) || opacityProgressed(glassesSamples)) {
      fail(
        'Row G: Splash entrance moved under prefers-reduced-motion — either reduced motion stopped ' +
          'being honoured, or this instrument reports motion that is not there.',
      )
    }
    console.log('[return-visit] Row G (static half): under prefers-reduced-motion, the same entrance genuinely stays inert — newReducedMotionContext repaired with a real, durable caller.')
  } finally {
    await reducedCtx.close()
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
    await testSplashEntranceReplaysHonestly(browser, webOrigin)
    console.log(
      '[return-visit] PASS — return-visit/re-login handling is honest against a real, healthy stack ' +
        "(rows A-G). This does NOT close #295 — see this file's own header for the exact boundary.",
    )
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[return-visit] FAIL —', error?.message ?? error)
  process.exit(1)
})
