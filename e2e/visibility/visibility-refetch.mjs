// Visibility-refetch regression gate (#223, promoting #215/#217's manual proof into CI).
//
// REQ-005's "shown honestly" clause (register.md) requires the unverified/verified banner to
// be a LIVE read, never a value snapshotted at sign-up/sign-in and left stale. #194/#215 fixed
// this on RegistrierungScreen, #217/#225 on LoginScreen; both now go through the shared
// `useEmailVerified(email)` hook (apps/mobile-web/src/auth/useEmailVerified.ts). This script is
// the standing regression guard for that shared seam, on both screens, against the real
// exported bundle + real API + real Postgres, cross-origin — no mocks.
//
// The mechanism under test: better-auth's session atom re-fetches on tab focus
// (`refetchOnWindowFocus`, auth-client.ts:26). A `visibilitychange` dispatch on the
// still-mounted document is the same trigger a real "return from the mail client" produces —
// NOT a reload/navigation, which would lose the screen's local `stage` state and drop the user
// straight past the banner entirely (see RegistrierungScreen.tsx/LoginScreen.tsx's own
// `Stage.success`/`Stage.unverified` comments).
//
// Per-screen assertion shape (Musti's #223 ruling — the substantive addition over the
// #215/#225 manual runs this promotes):
//   1. Real sign-up/sign-in → assert the UNVERIFIED banner.
//   2. Dispatch visibilitychange BEFORE the DB flip, and assert the banner does NOT flip. A
//      single break/restore of `refetchOnWindowFocus` (proven separately, see the PR's evidence
//      block) only proves "the banner never updates" — it says nothing about the fail-open
//      direction where `useEmailVerified`'s fail-closed rule lives (only `emailVerified === true`
//      counts). A permissive mutant of that rule leaves a break/restore-only gate green; this
//      step catches that class (#227's fifteenth instance). This assertion requires observing a
//      real `/api/auth/get-session` response between the dispatch and the check (Musti's #223
//      review, F3) — without that precondition, "banner did not flip" and "no refetch fired at
//      all" produce the identical green, and the assertion would hold only by accident of
//      better-auth's own `session-refresh.mjs` internals, not by anything this file checks.
//   3. Flip `emailVerified` in the real DB, dispatch visibilitychange again, and assert the
//      VERIFIED banner appears within a bounded timeout.
//
// ACCOUNT-SCOPING (#232, closing the gap #223's review left open — F4 below). Steps 1-3 above
// guard `useEmailVerified`'s fail-closed rule but not its account-scoping rule
// (`sessionData.user.email === email`, useEmailVerified.ts:35): in both flows the session's own
// email already equals the screen's email, so a mutant deleting that clause survived untouched.
// `testLoginScreen` closes it at its own tail (Musti's #232 ruling, in full below the function):
// a SECOND page in the SAME browser context signs `testRegistrierungScreen`'s already-verified
// account into the shared cookie jar while page1 is still showing the LoginScreen account's own
// verified banner, then asserts page1's banner REVERTS to unverified — the one shape that can
// kill that mutant, and the only shape neither flow above exercises. This is an e2e-layer
// addition on a rule already unit-guarded on both screens (`RegistrierungScreen.test.tsx:203-222`,
// `LoginScreen.test.tsx:284` — LoginScreen's own is the sole guard of 29 tests per #225, precisely
// because this screen is the one a second person signs into on a shared device as a routine path,
// not a race) — this file's job is proving the same property holds end-to-end against the real
// session atom and a real shared cookie jar, not re-deriving the product rule.
//
// SHARED-RATE-LIMIT BUCKET (Musti's #223 review, F1/F2/F5 — read this before adding a call).
// better-auth's built-in `/sign-up*`/`/sign-in*` rule (window=10s/max=3,
// apps/api/src/auth/better-auth.ts:169-187, a real REQ-010 control) is enforced per PATH, keyed
// `no-trusted-ip|<path>` — this environment can't resolve a client IP (the API logs that
// directly), so every script in the `Browser gates` job shares ONE bucket per path, not one per
// script (`e2e/responsive/banner-ds-qa.mjs`'s header documents the same mechanics — keep the two
// descriptions in sync if either changes). The bucket is a ROLLING window keyed on `lastRequest`,
// not a per-job quota: `count` resets after any gap longer than 10s, and `lastRequest` advances on
// every allowed call. The rule to keep in mind when adding a call on this path is about GAPS —
// never more than 3 sign-up/sign-in calls without a >10s quiet period — not about a shrinking
// pool of "calls left".
//
// This script does NOT clear the bucket (a prior version did, via `DELETE FROM "RateLimit"` —
// reverted: clearing a REQ-010 control to make a gate pass is exactly the inversion this project
// exists to prevent, and it would suppress the limiter for every later caller in the same job
// too, not just this script). Instead it PACES itself: `waitForRateLimitHeadroom` reads the
// bucket's current state (never deletes it) and waits out the remainder of the window if the
// path is already at its cap, so this script's own sign-up/sign-in calls behave like a
// well-behaved rate-limited client rather than relying on lucky timing against whatever ran
// immediately before it in the job — a claim `assertRequestCount` below now actually checks,
// rather than merely intends. `banner-ds-qa.mjs` now paces itself the same way (#336 CI
// investigation, Salih — see that file's own header for the full account): it used to rely on a
// reduced call count plus a fail-fast 429 guard instead of reading the bucket (Musti's #223
// ruling — the DS check never touches Postgres), and that held only as long as
// `breakpoint-layout.mjs`'s own CockpitScreen flows stayed slow enough to leave the bucket a
// >10s gap before `banner-ds-qa.mjs`'s turn. #336's faster query-retry defaults shrank that gap
// below 10s and reproduced the 429 twice in CI; `banner-ds-qa.mjs` now imports the same
// `../harness/rate-limit.mjs` pacer this file does and reads `DATABASE_URL` for it, read-only,
// same as here.
//
// WHAT THE PACER DOES NOT COVER (Musti's #223 review, F8). `waitForRateLimitHeadroom` absorbs a
// regression at or below the cap: if a bug made RegistrierungScreen fire three sign-ups on one
// click, none would be denied, the flow would stay green, and the pacer would just read a fuller
// bucket and wait a little longer before the next call. Un-paced, that call would have been the
// one to overflow the window and go red — so pacing genuinely removes a signal, not just a flake.
// The bucket's own `count` can't be the fix: it is a job-wide aggregate (shared with
// `cross-origin-smoke`/`breakpoint-layout.mjs`/`banner-ds-qa.mjs`), taken at one moment under a
// ROLLING window, so a reading of it describes only the last ~10s of the whole chain — it cannot
// distinguish "the job happened to be busy" from "this flow doubled its calls", and a terminal
// reading says nothing about what accumulated several scripts earlier. What actually names a
// same-flow regression is the call count that flow itself issues — deterministic, independent of
// whatever ran before it — which is what `countRequestsTo`/`assertRequestCount` below check per
// flow, alongside the existing `guardAgainst429` response guard. `signUpOutOfBand`'s call is
// counted separately (in practice, not counted at all): it is a raw Node `fetch`, so it bypasses
// both `page.on('request')`-based counting and `page.on('response')`-based `guardAgainst429`
// entirely — its own `!res.ok` check is the real, sufficient guard for that one call.
//
// #232's SPEND (Musti's #232 ruling, ADR-0021-style: state the cost, don't leave it implicit —
// same convention `banner-ds-qa.mjs`'s header established; corrected in Musti's #237 review, F1
// — a job-wide total is the wrong measurement for a gap-keyed bucket, see this file's own line
// above: "never more than 3 ... without a >10s quiet period — not about a shrinking pool"). The
// account-scoping case does NOT create a second account: `testRegistrierungScreen` already flips
// its own account to verified at its own tail, so that email is threaded into `testLoginScreen`
// as an explicit parameter and reused. Net addition: **+1 `/sign-in/email`, +0
// `/sign-up/email`**, both page-driven and instrumented by this file's own
// `countRequestsTo`/`guardAgainst429`/`waitForRateLimitHeadroom` — no uncounted, unpaced call
// enters the job the way `signUpOutOfBand`'s raw `fetch` does.
//
// What actually matters is the MINIMUM ENFORCED GAP between consecutive `/sign-in/email` calls,
// not a count: the job-boundary gap (`banner-ds-qa.mjs`'s one sign-in → this file's own
// LoginScreen sign-in) is the whole Registrierung flow, comfortably ≥20s. This file's own new
// gap (the LoginScreen sign-in → page2's cross-account sign-in) is NOT the two waits' durations
// stacked on top of `assertBannerDoesNotFlip`'s own 1.5s wait (corrected in Musti's #237
// re-review, F6 — his arithmetic, and his correction): that 1.5s wait sits INSIDE the first
// `waitOutFocusRefetchRateLimit` window, not before it. Both waits anchor on their own dispatch
// timestamp — `waitOutFocusRefetchRateLimit(negativeDispatchAt)` sleeps until
// `negativeDispatchAt + 5500`ms, and `assertBannerDoesNotFlip`'s 1.5s wait runs ~0.2s after
// `negativeDispatchAt` was captured, so it is consumed by that same 5.5s window, not additional
// to it. The two `waitOutFocusRefetchRateLimit` calls (5.5s each, one per dispatch) are what
// compose: a TIMER-GUARANTEED FLOOR of **11.0s**, not the two waits plus the 1.5s. Add the
// environment-dependent time neither wait accounts for — the sign-in round trip, the DB
// `UPDATE`, page2's own creation + `goto(networkidle)` + form fills — and two consecutive green
// CI runs measured **12 094ms and 12 060ms** between the two `loginSubmit` clicks. So the
// guaranteed margin over the 10s window is **1.0s**, not the wider margin a naive sum would
// suggest — worth stating exactly, since a floor comment is only useful if it names one the code
// can actually be held to. The conclusion is unchanged either way: 11.0s > 10s.
//
// That 11.0s floor is INCIDENTAL, not the real backstop, and it would be dishonest to lean on it:
// it falls out of `waitOutFocusRefetchRateLimit`, which exists for better-auth's *client-side*
// focus-refetch throttle (a different limiter, see the FINDING comment on that function below) —
// if `FOCUS_REFETCH_RATE_LIMIT_SECONDS` ever drops, this gap shrinks with it and nothing here
// would notice. The designed backstop is `waitForRateLimitHeadroom` immediately before page2's
// sign-in click (below) — real because it reads the shared `RateLimit` row directly and is
// therefore cross-process: it sees whatever `banner-ds-qa.mjs` or an earlier call in this same
// file already spent, not just this file's own count.
//
// Assumes the caller has already booted the same stack as `e2e/cross-origin/run.mjs` /
// `e2e/responsive/breakpoint-layout.mjs` (real Postgres, the compiled API, the exported web
// bundle statically served) — same job, see `.github/workflows/ci.yml`'s `Browser gates` job.
//
// Locator note (Musti's #223 review): neither banner nor its heading carries a `testID` on
// either screen (checked directly against RegistrierungScreen.tsx/LoginScreen.tsx) — both use
// `accessibilityRole="alert"` only. Selectors below are role + the resolved i18n copy
// (`COPY`, lifted from apps/mobile-web/src/i18n/resources.ts — same pattern
// `e2e/responsive/breakpoint-layout.mjs` already establishes), never a `data-testid`. That is a
// deliberate stop-rule, not an oversight — see the PR description.
//
// Exits non-zero on the first failed assertion — merge gate, not a report.

import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'

const WEB_ORIGIN = requireEnv('WEB_ORIGIN')
const API_ORIGIN = requireEnv('API_ORIGIN')
const DATABASE_URL = requireEnv('DATABASE_URL')

// Must match better-auth's own built-in special-path rule (better-auth.ts:169-187) — see the
// shared-rate-limit-bucket header comment above.
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 3

// One password for every account this file creates or signs into (Musti's #237 review, F2 —
// hoisted after `testRegistrierungScreen`'s own literal and `testLoginScreen`'s independently
// matched one turned out to be a credential contract standing in as two unrelated strings that
// happened to be identical: a one-character edit to either would have turned #232's cross-account
// sign-in into a 401 whose cause was two hundred lines away). Meets RegistrierungScreen's real
// policy floor (`COPY.registrierungPasswordPlaceholder` below) — it is not itself UI copy.
const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted straight from
// apps/mobile-web/src/i18n/resources.ts. Shared between RegistrierungScreen and LoginScreen
// via `auth.verifyBanner`/`auth.verifiedBanner` (both screens read the same keys).
const COPY = {
  splashSkip: 'Weiter zur App',
  register: 'Neu hier? Konto anlegen',
  registrierungEmailPlaceholder: 'du@beispiel.de',
  registrierungPasswordPlaceholder: 'Mindestens 6 Zeichen',
  registrierungSubmit: 'Konto anlegen',
  registrierungSuccessHeading: 'Willkommen bei SteuerEule.',
  loginSubmit: 'Einloggen',
  verifyHeading: 'Bitte bestätige noch deine E-Mail.',
  verifiedHeading: 'E-Mail bestätigt ✓',
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`::error::${name} is required.`)
    process.exit(1)
  }
  return value
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

// Direct SQL against the real Postgres the job already migrated — there is no mail client in
// this environment (#223's parent ticket, #224, records why that stays a permanently-manual
// iOS check), so verification is driven out-of-band the same way #215/#225's manual runs did.
function sql(query) {
  const url = new URL(DATABASE_URL)
  const host = url.hostname
  const port = url.port || '5432'
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = url.pathname.slice(1)
  return execSync(
    `psql -h ${host} -p ${port} -U ${user} -d ${database} -t -A -c "${query.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password } },
  ).trim()
}

/**
 * Reads (never mutates) the shared per-path rate-limit bucket's current state. `null` when the
 * path has no row yet — a fresh bucket, nothing to wait for. See the shared-rate-limit-bucket
 * header comment for why this exists instead of clearing the table.
 */
function readRateLimitBucket(path) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key = 'no-trusted-ip|${path}'`)
  if (!row) return null
  const [countStr, lastRequestStr] = row.split('|')
  const count = Number(countStr)
  const lastRequest = Number(lastRequestStr)
  if (!Number.isFinite(count) || !Number.isFinite(lastRequest)) return null
  return { count, lastRequest }
}

/**
 * Waits out the remainder of the rolling window if `path`'s shared bucket is already at its cap
 * — a real, bounded wait (event-driven arithmetic on the bucket's own `lastRequest`, not a guess)
 * rather than deleting the row. A well-behaved rate-limited client waits; it doesn't reset the
 * limiter for whoever calls next.
 */
async function waitForRateLimitHeadroom(path) {
  const bucket = readRateLimitBucket(path)
  if (!bucket) return
  const elapsed = Date.now() - bucket.lastRequest
  if (bucket.count >= RATE_LIMIT_MAX && elapsed < RATE_LIMIT_WINDOW_MS) {
    const waitMs = RATE_LIMIT_WINDOW_MS - elapsed + 250
    console.log(
      `[visibility-refetch] ${path}'s shared bucket is at ${bucket.count}/${RATE_LIMIT_MAX} ` +
        `(${elapsed}ms since its last call) — waiting ${waitMs}ms for the rolling window to lapse ` +
        `rather than clearing it.`,
    )
    await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs))
  }
}

/**
 * Fails loudly and immediately on a 429 from any auth path, instead of letting the caller's own
 * subsequent `waitFor` time out ten seconds later with no named cause (Musti's #223 review, F7 —
 * raised against `banner-ds-qa.mjs`, applied here too as defense-in-depth: this script already
 * paces itself via `waitForRateLimitHeadroom`, but a wrong assumption about the bucket key format
 * or a clock skew should still fail legibly, not as a mystery timeout).
 */
function guardAgainst429(page) {
  page.on('response', (response) => {
    if (response.status() === 429 && response.url().includes('/api/auth/')) {
      fail(
        `${response.url()} returned 429 — the shared per-path rate-limit bucket was exhausted ` +
          `despite waitForRateLimitHeadroom (see this file's header comment).`,
      )
    }
  })
}

/**
 * Counts real network REQUESTS (not responses) this page issues to a specific auth path — the
 * deterministic counterpart `waitForRateLimitHeadroom`'s tolerance needs (Musti's #223 review,
 * F8; see the "WHAT THE PACER DOES NOT COVER" header note for why the shared bucket's own `count`
 * can't do this job). `page.on('request')`, not `page.on('response')`: this only needs to know a
 * request was sent, before the rate limiter's decision on it is even known.
 *
 * Matches on method + URL, not URL alone (Musti's #223 re-review, F8 follow-up): `WEB_ORIGIN` and
 * `API_ORIGIN` are genuinely distinct origins in this job (`ci.yml`'s `Browser gates` job), so
 * every page-driven auth POST is cross-origin, and the API's CORS options set no `maxAge`, so
 * Chromium preflights each one against its own default cache window. An `OPTIONS` to the same URL
 * satisfies a URL-only match exactly like the real `POST` does — latent today only because this
 * Chromium build/version doesn't (yet, or don't-know-if-ever) surface preflights as
 * `page.on('request')` events; an assertion whose whole value is exactness shouldn't rest on an
 * unstated engine behaviour a Playwright bump could change out from under it.
 */
function countRequestsTo(page, path) {
  const counter = { count: 0 }
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes(path)) counter.count += 1
  })
  return counter
}

/**
 * Asserts an EXACT count, not an upper bound (Musti's #223 re-review, F8 follow-up — the
 * question was raised and settled the other way): "at most N" goes blind to a retry-loop
 * regression (1 call where 1 is expected today, silently 1-of-2 tomorrow, never trips a ceiling
 * of 1), and a lower bound is already dead surface — the heading waits this runs after can't pass
 * on zero calls in the first place. A tripwire on the flow's current shape, which a future author
 * must raise deliberately rather than the assertion quietly tolerating drift, is the point.
 */
function assertRequestCount(counter, path, expected, label) {
  if (counter.count !== expected) {
    fail(
      `${label}: expected exactly ${expected} request(s) to ${path}, observed ${counter.count}. ` +
        `If this is a same-flow regression issuing more calls than expected, it would otherwise ` +
        `hide behind waitForRateLimitHeadroom's tolerance (Musti's #223 review, F8) — that's what ` +
        `this catches. If this flow legitimately gained a call (a retry, a second screen sharing ` +
        `this page), raise this number deliberately rather than relaxing the assertion.`,
    )
  }
}

async function signUpOutOfBand(email, password) {
  const res = await fetch(`${API_ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
}

/**
 * The real "return from the mail client" trigger, without a mail client: a hidden→visible
 * `visibilitychange` pair on the still-mounted document (no reload/navigation — see the header
 * comment for why a reload can't exercise this code path at all).
 */
async function dispatchVisibilityChange(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(50)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/**
 * Step 2 of the per-screen shape: dispatch while the DB row is still unverified, and assert the
 * banner does NOT flip. Requires observing a real `/api/auth/get-session` response between the
 * dispatch and the check (Musti's #223 review, F3) — otherwise "no flip" could mean "no refetch
 * fired at all", which proves nothing about the fail-closed rule this step exists to guard.
 */
async function assertBannerDoesNotFlip(page) {
  const dispatchedAt = Date.now()
  const gotSessionResponse = page
    .waitForResponse((response) => response.url().includes('/api/auth/get-session'), { timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  await dispatchVisibilityChange(page)

  if (!(await gotSessionResponse)) {
    fail(
      'No /api/auth/get-session response was observed after the visibilitychange dispatch — the ' +
        '"banner did not flip" check below would hold on silence alone, which proves nothing ' +
        "about useEmailVerified's fail-closed rule (Musti's #223 review, F3).",
    )
  }

  await page.waitForTimeout(1_500)
  const stillUnverified = await page.getByRole('alert').getByText(COPY.verifyHeading).isVisible().catch(() => false)
  const verifiedAppeared = await page.getByRole('alert').getByText(COPY.verifiedHeading).count()
  if (!stillUnverified || verifiedAppeared > 0) {
    fail(
      'Banner flipped to verified on a visibilitychange dispatch while emailVerified was still ' +
        'false in the DB — useEmailVerified\'s fail-closed rule is not holding.',
    )
  }
  return dispatchedAt
}

async function assertBannerFlipsAfterDbVerify(page, email) {
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const dispatchedAt = Date.now()
  await dispatchVisibilityChange(page)
  await page.getByRole('alert').getByText(COPY.verifiedHeading).waitFor({ state: 'visible', timeout: 5_000 })
  return dispatchedAt
}

/**
 * The account-scoping companion to assertBannerDoesNotFlip/assertBannerFlipsAfterDbVerify (#232,
 * closing the gap Musti's #223 review named F4). Signs `foreignVerifiedEmail` — an ALREADY
 * verified account, reused from `testRegistrierungScreen`'s own tail rather than a freshly
 * created one (Musti's #232 ruling: no second sign-up needed) — into a SECOND page of the SAME
 * browser context as `page`, through the real login form, then dispatches a visibilitychange on
 * `page` and asserts its banner REVERTS to unverified.
 *
 * Page-driven, not out-of-band (Musti's #232 ruling, #1): unlike `signUpOutOfBand`, this call has
 * a page to be issued from, so it goes through the real form and is fully instrumented the same
 * as any other page-driven auth call in this file — its own `countRequestsTo`/`guardAgainst429`/
 * `waitForRateLimitHeadroom`, all page2-scoped so page1's own exact-count assertions above stay
 * truthfully unchanged (nothing to deliberately bump).
 *
 * Assertion direction is deliberately positive, not negative-then-positive (Musti's #232 ruling,
 * #3): a swallowed refetch, an unshared cookie jar, or a session that silently failed to land all
 * produce the SAME outcome here — the unverified heading never (re)appears — so it is this
 * waitFor's timeout that goes red, never a false green. That direction alone doesn't need
 * `assertBannerDoesNotFlip`'s F3 "was a real get-session observed" precondition to PASS
 * correctly — but it is borrowed anyway (Musti's #237 review, F3), because without it a failure
 * can't honestly distinguish "the refetch never happened" from "the refetch happened and
 * account-scoping let it through" — three different faults producing the identical red, and the
 * message below only ever named one of them. With the precondition, a swallowed refetch gets its
 * own message rather than being misdiagnosed as the account-scoping rule failing.
 *
 * `screenEmail` (page1's own account) and `foreignVerifiedEmail` (the one signed into page2) are
 * both threaded through so a failing run's log names both accounts, not just one — the reader
 * shouldn't have to reconstruct which two accounts were in play from surrounding log lines.
 */
async function assertBannerRevertsOnForeignAccountSession(context, page, screenEmail, foreignVerifiedEmail, password) {
  const page2 = await context.newPage()
  try {
    guardAgainst429(page2)
    const crossAccountSignIn = countRequestsTo(page2, '/api/auth/sign-in/email')

    await skipSplash(page2)
    await page2.getByPlaceholder('du@beispiel.de').fill(foreignVerifiedEmail)
    await page2.getByPlaceholder('••••••••').fill(password)
    await waitForRateLimitHeadroom('/sign-in/email')
    const signInResponse = page2.waitForResponse(
      (response) => response.url().includes('/api/auth/sign-in/email'),
      { timeout: 10_000 },
    )
    await page2.getByRole('button', { name: COPY.loginSubmit }).click()
    const response = await signInResponse
    if (!response.ok()) {
      fail(
        `Cross-account sign-in (page2, ${foreignVerifiedEmail}) returned ${response.status()} — ` +
          'the account-scoping case never got a second real session into the shared cookie jar.',
      )
    }
    assertRequestCount(crossAccountSignIn, '/api/auth/sign-in/email', 1, 'Cross-account sign-in (page2)')
  } finally {
    // Closed BEFORE the dispatch on page1, below — load-bearing, not incidental (Musti's #237
    // review, F5). Closing page2 first, then reading page1, is what proves the foreign session
    // lives in the CONTEXT's shared cookie jar rather than in the page that created it — the
    // property useEmailVerified is actually exposed to on a shared device. Moving this close to
    // after the assertion would silently weaken the test: it would still pass, but would no
    // longer distinguish "the context shares the session" from "the page that signed in still
    // happens to be alive", and no assertion's colour would change to tell a future reader that.
    await page2.close()
  }

  const dispatchedAt = Date.now()
  const gotSessionResponse = page
    .waitForResponse((response) => response.url().includes('/api/auth/get-session'), { timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  await dispatchVisibilityChange(page)

  const observedRefetch = await gotSessionResponse
  const reverted = observedRefetch
    ? await page
        .getByRole('alert')
        .getByText(COPY.verifyHeading)
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
    : false

  if (!observedRefetch) {
    fail(
      `LoginScreen (account ${screenEmail}) never observed a /api/auth/get-session response after ` +
        `the visibilitychange dispatch that followed page2's cross-account sign-in ` +
        `(${foreignVerifiedEmail}) — the refetch itself was swallowed. This says nothing about ` +
        "useEmailVerified's account-scoping rule; it never got a live session to evaluate.",
    )
  }
  if (!reverted) {
    fail(
      `LoginScreen's banner (account ${screenEmail}) did not revert to unverified after a real ` +
        `get-session refetch that followed a second, already-verified account's session ` +
        `(${foreignVerifiedEmail}) landing in the shared cookie jar — useEmailVerified's ` +
        'account-scoping rule (sessionData.user.email === email) is not holding.',
    )
  }
  return dispatchedAt
}

// FINDING, not fixed at the source (better-auth's own client, not this repo's code): every
// visibilitychange-triggered refetch is itself rate-limited client-side to once per
// FOCUS_REFETCH_RATE_LIMIT_SECONDS=5 (better-auth/dist/client/session-refresh.mjs) — a *second*
// visibilitychange dispatch inside that window is silently swallowed (`fetchSession` is never
// called), which is indistinguishable from the app doing nothing. The negative-then-positive
// shape this ticket requires dispatches twice in quick succession, so without this wait the
// *positive* assertion times out for a reason that has nothing to do with `useEmailVerified` —
// discovered running this very script against the real stack while wiring it into CI. Waiting
// out the real throttle here is also the honest thing to do: a real user's mail-app round trip
// is never sub-5-seconds anyway. (This is a distinct, client-side throttle from the server-side,
// DB-backed rate limit the shared-bucket header comment above describes — two different limiters,
// not the same one described twice.)
async function waitOutFocusRefetchRateLimit(sinceMs) {
  const elapsed = Date.now() - sinceMs
  const remaining = 5_500 - elapsed
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
}

async function skipSplash(page) {
  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' })
  // Guarded the same way breakpoint-layout.mjs's skipSplash is: SplashScreen's own
  // AUTO_ADVANCE_MS may have already fired by the time `networkidle` resolves, in which case
  // the skip button is already gone.
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) {
    await splashSkip.click()
  }
}

async function testRegistrierungScreen(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  try {
    const page = await context.newPage()
    guardAgainst429(page)
    const signUpRequests = countRequestsTo(page, '/api/auth/sign-up/email')
    const email = `visibility-refetch-registrierung-${Date.now()}@beispiel.de`

    await skipSplash(page)
    await page.getByText(COPY.register, { exact: true }).click()
    await page.getByPlaceholder(COPY.registrierungEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.registrierungPasswordPlaceholder).fill(TEST_PASSWORD)
    await waitForRateLimitHeadroom('/sign-up/email')
    await page.getByRole('button', { name: COPY.registrierungSubmit }).click()
    await page.getByText(COPY.registrierungSuccessHeading).waitFor({ state: 'visible', timeout: 10_000 })
    assertRequestCount(signUpRequests, '/api/auth/sign-up/email', 1, 'RegistrierungScreen sign-up')

    await page.getByRole('alert').getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 5_000 })
    console.log('[visibility-refetch] RegistrierungScreen: unverified banner shown after real sign-up')

    const negativeDispatchAt = await assertBannerDoesNotFlip(page)
    console.log('[visibility-refetch] RegistrierungScreen: banner did NOT flip on dispatch while still unverified')

    await waitOutFocusRefetchRateLimit(negativeDispatchAt)
    await assertBannerFlipsAfterDbVerify(page, email)
    console.log('[visibility-refetch] RegistrierungScreen: banner flipped to verified after DB flip + dispatch')

    // Returned, not left local (#232, Musti's ruling #2): this account is already real and
    // already verified by the time this flow ends, so it is reused as the "foreign, already
    // verified" account testLoginScreen's own account-scoping tail needs, rather than paying for
    // a second sign-up. The ordering dependency (this flow must run, and finish, before
    // testLoginScreen's tail) lives in the function signature below, not in a module global.
    return email
  } finally {
    await context.close()
  }
}

/**
 * @param {string} foreignVerifiedEmail - an already-verified account's email, reused from
 *   `testRegistrierungScreen`'s own tail (#232) — this flow never signs it up itself. Guarded at
 *   entry (Musti's #237 review, F4): without the guard, a future change that drops
 *   `testRegistrierungScreen`'s tail `return` surfaces ~110 lines away as a Playwright type error
 *   on `.fill(undefined)`, not as the broken ordering contract it actually is. This makes the
 *   sequential dependency `main()` already enforces (flow 1 fully awaited before flow 2 starts,
 *   Musti's #232 ruling — an explicit parameter over a module global) fail by its own name; the
 *   real cost, worth stating rather than hiding, is that this flow can no longer be run standalone
 *   for a bisect — there is no per-flow runner today, and a red flow 1 already cost the Login flow
 *   entirely before this parameter existed.
 */
async function testLoginScreen(browser, foreignVerifiedEmail) {
  if (!foreignVerifiedEmail) {
    fail(
      "testLoginScreen needs testRegistrierungScreen's verified account (#232) as its " +
        `foreignVerifiedEmail parameter — received ${JSON.stringify(foreignVerifiedEmail)}. Flow 1 ` +
        'either returned nothing or was never run first.',
    )
  }

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  try {
    const page = await context.newPage()
    guardAgainst429(page)
    const signInRequests = countRequestsTo(page, '/api/auth/sign-in/email')
    const email = `visibility-refetch-login-${Date.now()}@beispiel.de`
    const password = TEST_PASSWORD

    // The account is created out-of-band (a direct POST, its own cookie jar never touching the
    // browser context) so the browser reaches LoginScreen's `unverified` stage through a real
    // sign-in click, not a fabricated stage — this screen's own sign-up flow is
    // RegistrierungScreen's job to cover, not this one's. This call is a raw Node `fetch`, never
    // a page-driven request, so it is invisible to both `countRequestsTo` and `guardAgainst429`
    // above (see the "WHAT THE PACER DOES NOT COVER" header note) — `signUpOutOfBand`'s own
    // `!res.ok` check is what covers a 429 on this specific call.
    await waitForRateLimitHeadroom('/sign-up/email')
    await signUpOutOfBand(email, password)

    await skipSplash(page)
    await page.getByPlaceholder('du@beispiel.de').fill(email)
    await page.getByPlaceholder('••••••••').fill(password)
    await waitForRateLimitHeadroom('/sign-in/email')
    await page.getByRole('button', { name: COPY.loginSubmit }).click()
    await page.getByRole('alert').getByText(COPY.verifyHeading).waitFor({ state: 'visible', timeout: 10_000 })
    assertRequestCount(signInRequests, '/api/auth/sign-in/email', 1, 'LoginScreen sign-in')
    console.log('[visibility-refetch] LoginScreen: unverified banner shown after real sign-in')

    const negativeDispatchAt = await assertBannerDoesNotFlip(page)
    console.log('[visibility-refetch] LoginScreen: banner did NOT flip on dispatch while still unverified')

    await waitOutFocusRefetchRateLimit(negativeDispatchAt)
    const positiveDispatchAt = await assertBannerFlipsAfterDbVerify(page, email)
    console.log('[visibility-refetch] LoginScreen: banner flipped to verified after DB flip + dispatch')

    // Re-asserted here, not just at :405 (Musti's #223 re-review, F8 follow-up): unlike
    // RegistrierungScreen, where nothing after its own sign-up assertion can issue another
    // sign-up, everything below :405 is the two visibilitychange refetch cycles — exactly where
    // an unanticipated re-authentication would sit, and the first assertion stopped watching
    // before them. Kept the first assertion too (not moved) — it fails fast, naming the defect
    // before spending the ~15s the visibility phases take.
    assertRequestCount(signInRequests, '/api/auth/sign-in/email', 1, 'LoginScreen sign-in (post-dispatch)')

    // #232's account-scoping tail (Musti's #232 ruling, #3: after the existing DB flip, never
    // before — beforehand the foreign session would displace the screen's own before step 3 could
    // pass, forcing a re-authentication this design avoids). page1's own `signInRequests` counter
    // above is intentionally NOT re-read after this point: the new sign-in below is issued on
    // page2, a second page of this same context, so page1 truthfully never issues another request
    // here — nothing to bump.
    await waitOutFocusRefetchRateLimit(positiveDispatchAt)
    await assertBannerRevertsOnForeignAccountSession(context, page, email, foreignVerifiedEmail, password)
    console.log(
      '[visibility-refetch] LoginScreen: banner reverted to unverified once a foreign, ' +
        "already-verified account's session landed in the shared cookie jar (account-scoping)",
    )
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const foreignVerifiedEmail = await testRegistrierungScreen(browser)
    await testLoginScreen(browser, foreignVerifiedEmail)
    console.log(
      '[visibility-refetch] PASS — both screens re-read verification live, both directions, and ' +
        "LoginScreen rejects a foreign account's stale session (account-scoping, #232).",
    )
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[visibility-refetch] FAIL —', error?.message ?? error)
  process.exit(1)
})
