// Cold-start session-read acceptance gate for #349 (PR #353) — Salih's task, filed the same day
// as the fix, against the real stack, not against `DeviceScreen.test.tsx`'s MSW handlers.
//
// THE DEFECT THIS FILE EXISTS TO KEEP FIXED: at cold start, better-auth's own session atom
// (`session-atom.mjs:88-98`) only nulls `data` on a 401. Its OWN initial value is already
// `data: null`, so a first-fetch 429/5xx/genuine-network-failure settles at `data: null, error:
// <something>` — indistinguishable, to a caller reading only `data`, from "you have no session".
// `DeviceScreen` made exactly that read pre-fix and rendered the embedded `LoginScreen` to a phone
// that, per the server, might genuinely have been signed in — see #349/#353's own history for the
// full account. `useAccountSession()` (`apps/mobile-web/src/auth/useAccountSession.ts`) is the fix:
// a third, honest `unknown` state, never collapsed into `signed-out`.
//
// WHY THIS FILE, ON TOP OF `DeviceScreen.test.tsx`'s ALREADY-GREEN UNIT SUITE: that suite proves
// the derivation and the screen wiring against MSW — a mocked JSON body swapped in-process, never
// a real network condition. It is real proof of the LOGIC. It says nothing about whether a
// genuinely rate-limited or unreachable `/get-session`, intercepted at the actual transport layer
// against the real exported bundle talking to the real built API, still renders the honest state —
// exactly the gap between "green CI" and "the stakeholder would accept it" this file closes.
// `page.route(...).fulfill({status: 429})` / `.abort('failed')` below are genuine network-layer
// interceptions of the browser's own real `fetch` to a real API origin, not a swapped response
// body a test framework hands back before any network stack is involved.
//
// CALIBRATED, NOT ASSUMED (ADR-0021 §5 — a check must be proven to fail before it is trusted to
// pass): this file's own PR body records reverting `DeviceScreen.tsx` to its pre-#353 commit,
// re-exporting the web bundle, and re-running this exact script — rows A/B went red (the honest
// state never appeared, Login rendered instead) while rows C/D (the two "must still work" cases)
// stayed green throughout, proving this file discriminates the actual defect rather than being
// satisfied by anything short of the real fix. Restoring the fix and re-running returned every row
// to green. That is the control proof this file's own claim rests on.
//
// NO RATE-LIMIT BUDGET SPENT: every row below navigates straight to `/device` with
// `showDeviceQr={false}` on the embedded LoginScreen (AC-2/AC-7's own "no second device code next
// to sign in to approve this one" rule) and never submits a sign-in/sign-up form — no
// `no-trusted-ip|*` bucket, no `device-code:*` bucket. This file's ordering relative to every other
// step in the `Browser gates` job is therefore unconstrained; it is wired in CI after the existing
// steps for the usual "least risk to an already-proven step" reason, not because anything here
// requires it.
//
// NOT COVERED HERE, NAMED RATHER THAN HIDDEN: `DatenschutzScreen`'s own `useAccountSession()` call
// shares the exact same derivation (same hook, same unit-tested priority rule) but has no
// direct URL — it is a sub-view reached by clicking through `/app` → Profil → "Datenschutz", and
// forcing ITS cold-start specifically (rather than the already-covered post-sign-in refetch case)
// would need a click-through sequence disproportionate to the marginal risk on top of what this
// file and `useAccountSession.test.tsx`'s exhaustive derivation table already prove — the shared
// derivation is what makes DatenschutzScreen's own cold-start case low-risk, not untested logic.
// Flagged as a real, deliberate gap, not silently assumed covered.
import { startStack } from '../harness/stack.mjs'
import { launchBrowser, closeBrowser, newContextAtBreakpoint } from '../harness/browser.mjs'
import { fail } from '../harness/rate-limit.mjs'

const COPY = {
  heading: 'Das können wir gerade nicht prüfen.',
  body: 'Wir können gerade nicht feststellen, ob du angemeldet bist. Versuch es noch mal.',
  retry: 'Noch mal versuchen',
  login: 'Einloggen',
}

/** Navigates straight to `/device` (AC-1's own route — no splash/login detour, matching how a
 *  phone's camera actually opens it) with `getSessionRoute` already armed on a fresh context. */
async function gotoDevice(browser, webOrigin, getSessionRoute) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  await page.route(getSessionRoute.pattern, getSessionRoute.handler)
  await page.goto(`${webOrigin}/device`, { waitUntil: 'networkidle' })
  return { ctx, page }
}

async function assertHonestUnknown(browser, webOrigin, apiOrigin, { handler, label }) {
  const { ctx, page } = await gotoDevice(browser, webOrigin, { pattern: `${apiOrigin}/api/auth/get-session*`, handler })
  try {
    await page.getByText(COPY.heading, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const headingVisible = await page.getByText(COPY.heading, { exact: true }).isVisible().catch(() => false)
    const bodyVisible = await page.getByText(COPY.body, { exact: true }).isVisible().catch(() => false)
    const loginVisible = await page.getByText(COPY.login, { exact: true }).isVisible().catch(() => false)
    if (!headingVisible) fail(`${label}: the honest "${COPY.heading}" heading never appeared within 15s — the cold-start failure was not surfaced at all.`)
    if (!bodyVisible) fail(`${label}: the honest body copy ("${COPY.body}") is missing even though the heading rendered.`)
    if (loginVisible) fail(`${label}: LoginScreen rendered ("${COPY.login}") despite a cold-start transport failure on GET /api/auth/get-session — this IS #349, reopened.`)
    console.log(`[cold-start-session-failure] ${label}: honest "could not check" state shown, LoginScreen did not render.`)
  } finally {
    await ctx.close()
  }
}

async function assertLoginStillShows(browser, webOrigin, apiOrigin, { status, body, label }) {
  const { ctx, page } = await gotoDevice(browser, webOrigin, {
    pattern: `${apiOrigin}/api/auth/get-session*`,
    handler: (route) => route.fulfill({ status, contentType: 'application/json', body }),
  })
  try {
    await page.getByText(COPY.login, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const loginVisible = await page.getByText(COPY.login, { exact: true }).isVisible().catch(() => false)
    if (!loginVisible) fail(`${label}: LoginScreen never rendered within 15s — this control case (${label}) must always still show Login (never regress the case #349 explicitly says was never broken).`)
    console.log(`[cold-start-session-failure] ${label}: LoginScreen correctly still renders.`)
  } finally {
    await ctx.close()
  }
}

/** The retry affordance must genuinely re-ask the server, not just re-render stale state — a
 *  real second network call, whose honest answer (here, a genuine "no session") is what the
 *  screen then reflects. */
async function assertRetryReAsks(browser, webOrigin, apiOrigin) {
  let calls = 0
  const { ctx, page } = await gotoDevice(browser, webOrigin, {
    pattern: `${apiOrigin}/api/auth/get-session*`,
    handler: (route) => {
      calls += 1
      if (calls === 1) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'nope' }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    },
  })
  try {
    await page.getByText(COPY.heading, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(COPY.retry, { exact: true }).click()
    await page.getByText(COPY.login, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const loginVisible = await page.getByText(COPY.login, { exact: true }).isVisible().catch(() => false)
    if (!loginVisible) fail('Retry: clicking "Noch mal versuchen" did not reach Login on its own honest (200/null) answer within 15s.')
    if (calls < 2) fail(`Retry: expected at least 2 real GET /api/auth/get-session calls (initial + retry), observed ${calls} — the retry button did not re-ask the server.`)
    console.log('[cold-start-session-failure] Retry: the "could not check" state\'s retry button issues a real second request and reaches Login on its honest answer.')
  } finally {
    await ctx.close()
  }
}

async function main() {
  const { apiOrigin, webOrigin } = await startStack()
  const browser = await launchBrowser()

  try {
    await assertHonestUnknown(browser, webOrigin, apiOrigin, {
      handler: (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'rate limited' }) }),
      label: 'Cold-start 429',
    })
    await assertHonestUnknown(browser, webOrigin, apiOrigin, {
      handler: (route) => route.abort('failed'),
      label: 'Cold-start genuine network failure',
    })
    await assertHonestUnknown(browser, webOrigin, apiOrigin, {
      handler: (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
      label: 'Cold-start 500',
    })
    await assertLoginStillShows(browser, webOrigin, apiOrigin, { status: 200, body: 'null', label: 'Control: genuine 200/null cold start' })
    await assertLoginStillShows(browser, webOrigin, apiOrigin, { status: 401, body: JSON.stringify({ message: 'nope' }), label: 'Control: cold-start 401 (the one authoritative "signed out" status)' })
    await assertRetryReAsks(browser, webOrigin, apiOrigin)

    console.log(
      '[cold-start-session-failure] PASS — a cold-start transport failure on GET /api/auth/get-session renders the ' +
        'honest "could not check" state, never LoginScreen, against the real running stack (#349/#353).',
    )
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[cold-start-session-failure] FAIL —', error?.message ?? error)
  process.exit(1)
})
