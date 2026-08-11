// #241/#248/#292 — X-Forwarded-For trusted verbatim: better-auth's built-in rate
// limiter and Session.ipAddress both key on getIp(), which reads X-Forwarded-For
// and, with `advanced.ipAddress.trustedProxies` unset, trusts a single-value header
// outright. Real Postgres, real HTTP against the actual `buildApp()` boot (never
// `.inject()`, never a mocked limiter — the same tier every other REQ-010 assertion
// runs at).
//
// Three distinct, independently-measured shapes live in this file, not one — each
// its own describe block on purpose (Musti's review of the original A1/A2 split):
//
//   A0 (new) — no X-Forwarded-For header at all (the actual shape of every request
//   in this project's CI, since no reverse proxy sits in front of `node --import tsx
//   dist/main.js` there): getIp() returns null, and better-auth's own fallback is a
//   SINGLE literal key (`no-trusted-ip|<path>`) shared by every caller, not fresh
//   per caller — measured directly against the real stack while diagnosing #292:
//   two entirely unrelated target accounts alternately probed collide in the same
//   three-request bucket. This is the literal mechanism behind the "Rate limiting
//   could not determine a client IP..." warning logged on every CI run, and the
//   reason `Browser gates`' independent e2e scripts (targeting different accounts)
//   observably interfered with each other's quota (Salih's finding).
//
//   A1 — a caller who DOES send an X-Forwarded-For header, a fresh value on every
//   request, targeting a FRESH, never-before-seen account each time (the realistic
//   shape of stolen-credential-list stuffing: many accounts, one guess each). The
//   IP-keyed bucket never accumulates past 1 — still true, still unfixed without
//   the real deployment (#292), and this describe block stays a permanent
//   regression test for exactly that reason.
//
//   The account-keyed control (#248, login-rate-limit.ts) — the SAME IP rotation as
//   A1, but targeting the SAME account repeatedly (the realistic shape of a
//   targeted brute-force against one known account/email). This is what closes:
//   REQ-010's own GWT clause is "repeated failed logins from the SAME ACCOUNT",
//   which does not actually require trusting the caller's IP at all — only that the
//   caller keeps naming the same email. Proven here as a positive "the fix works"
//   test, not a `@documents-defect` one.
//
// A2/A3 (unchanged) prove the opposite half — TRUSTED_PROXIES configured, a genuine
// two-hop chain, the real client correctly resolved despite a spoofed leading hop.
//
// Each app instance below is booted with its own TRUSTED_PROXIES value baked in at
// construction time, so no two describe blocks share one instance reconfigured
// mid-test.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LOGIN_RATE_LIMIT_MAX, loginRateLimitKey } from '../../src/auth/login-rate-limit.js'

async function bootApp(port: number): Promise<{ app: NestFastifyApplication; baseUrl: string; prisma: PrismaClient }> {
  const { buildApp } = await import('../../src/main.js')
  const app = await buildApp()
  await app.listen(port, '127.0.0.1')
  const baseUrl = await app.getUrl()
  const { PrismaService } = await import('../../src/prisma/prisma.service.js')
  const prisma = app.get(PrismaService)
  return { app, baseUrl, prisma }
}

async function cleanUp(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rateLimit.deleteMany()
}

// better-auth's built-in special rule for /sign-in* (getDefaultSpecialRules,
// better-auth/dist/api/rate-limiter/index.mjs) — window 10s / max 3. Not our own
// config; asserted against here because it's the actual surface REQ-010/ADR-0013 §6
// names as bypassable.
const SIGN_IN_WINDOW_MAX = 3

// A trusted Origin, matching CORS_ALLOWED_ORIGINS below — without it, better-auth's
// own origin-check middleware (origin-check.mjs's `validateFormCsrf`) rejects the
// request with 403 MISSING_OR_NULL_ORIGIN before ever reaching credential
// validation (Node's `fetch()` sets Fetch Metadata headers plain `curl` doesn't,
// which trips this; checked directly, not assumed). That 403 happens to also prove
// A1's point (it's also never 429), but it would make the test read as asserting an
// accident of the HTTP client rather than the actual failed-login status this test
// means to name — sending Origin exercises the real credential-check path instead.
async function attemptSignIn(baseUrl: string, email: string, xForwardedFor?: string): Promise<number> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://allowed.example.com' }
  if (xForwardedFor !== undefined) headers['x-forwarded-for'] = xForwardedFor
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: 'definitely-wrong-password' }),
  })
  return response.status
}

// @documents-defect #292 — A0 stays green *because* the no-XFF-at-all shared bucket is
// unfixed (register.md, REQ-010): closing it needs a real reverse proxy that reliably
// stamps X-Forwarded-For on every request, which needs the still-missing deployment (#292).
//
// This suite runs under NODE_ENV=test (vitest.integration.config.ts's own `env` block —
// required for Nest's decorator metadata via unplugin-swc). better-auth's own env module
// (@better-auth/core/env/env-impl) reads NODE_ENV into a top-level `const` exactly once,
// the first time it is imported in this process — so `isTest()` is permanently `true` for
// the rest of THIS vitest worker's life, and no per-test `process.env` change can undo
// that. Concretely: from THIS describe block's own test, `getIp()`'s literal `null` return
// (the branch that produces the `no-trusted-ip` sentinel key) is unreachable — its own
// `isTest()||isDevelopment()` fallback to a fixed `127.0.0.1` fires first, so the row this
// test's own request produces is always `127.0.0.1|/sign-in/email`.
//
// **Correction (Musti's review, PR #339, blocking finding 3):** "structurally unreachable
// from inside this suite" — i.e. the whole *file*, or this DB across a whole test run — was
// false and measured false: he reproduced a real `no-trusted-ip|/sign-in/email` row read
// back by THIS test three separate ways (run alongside `req-010-security-hardening.test.ts`
// against a database carrying a stale row; a seeded stale row alone; this session's own
// manual boot-proof against a real compiled server with `NODE_ENV` genuinely unset, writing
// directly into the same shared Postgres this integration tier also uses). The `RateLimit`
// table has no per-test/per-file isolation and nothing prunes it, so any OTHER process that
// writes a `no-trusted-ip|...` row into the same database — a different test file, a manual
// boot, a previous run that didn't clean up — leaves it there for an unordered, `contains`-
// filtered `findFirst` to pick up. `beforeEach` below (not only `afterEach`) exists precisely
// so this test's precondition is established, not assumed; the assertion now reads the
// COMPLETE set of rows this test's own two requests can have produced, not an arbitrary one.
// The `no-trusted-ip` string itself remains real and was measured independently against a
// real boot with `NODE_ENV` genuinely unset (the actual shape of CI's `smoke`/`Browser gates`
// jobs) while diagnosing #292: two alternating target emails with no XFF header collided in
// one `no-trusted-ip|/sign-in/email` row, capped at 3 — the same shape this test proves for
// the `127.0.0.1` variant it can actually produce from inside vitest.
describe('#241/#292 A0 — no X-Forwarded-For header at all: getIp() falls back to one caller-agnostic key, every caller shares one bucket', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'trusted-proxies-a0-secret'
    process.env.BETTER_AUTH_SECRET = 'trusted-proxies-a0-better-auth-secret-0123'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    // An explicit, deliberate "no proxy in front of this deployment" (the literal value
    // CI's `Browser gates`/`smoke` jobs set) — not the same as leaving it unset, which
    // would throw in production; this is the real, intentional posture those jobs run
    // under today.
    process.env.TRUSTED_PROXIES = 'none'
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  // Establishes the precondition rather than assuming it (Musti's review, PR #339,
  // blocking finding 3) — this table is shared with every other file/process that talks
  // to the same database, and nothing else prunes it.
  beforeEach(async () => {
    await cleanUp(prisma)
  })

  afterEach(async () => {
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('two entirely unrelated target accounts, probed with no X-Forwarded-For header, collide in one shared bucket', async () => {
    const statuses: number[] = []
    // SIGN_IN_WINDOW_MAX attempts against account A exhaust the shared bucket...
    for (let i = 0; i < SIGN_IN_WINDOW_MAX; i += 1) {
      statuses.push(await attemptSignIn(baseUrl, 'a0-victim-a@example.com'))
    }
    // ...so the very FIRST attempt against an entirely different account, B, which has
    // never been touched before, is already blocked — proving the bucket is shared
    // across callers, not scoped to either account or (nonexistent) IP.
    statuses.push(await attemptSignIn(baseUrl, 'a0-victim-b@example.com'))

    expect(statuses).toEqual([...Array(SIGN_IN_WINDOW_MAX).fill(401), 429])

    // The COMPLETE set of matching rows, not an arbitrary one (Musti's review, PR #339,
    // blocking finding 3 — an unordered `findFirst` with `contains` can return a row this
    // test never created). Because `beforeEach` just cleared the table, every row found here
    // was created by this test's own requests — asserting there is exactly one distinct key
    // is itself part of the proof that the bucket is shared, not per-account.
    const rows = await prisma.rateLimit.findMany({ where: { key: { contains: '/sign-in/email' } } })
    const distinctKeys = [...new Set(rows.map((row) => row.key))]
    expect(distinctKeys).toEqual(['127.0.0.1|/sign-in/email'])
  })
})

// @documents-defect #292 — A1 stays green *because* the single-value X-Forwarded-For bypass
// is unfixed (register.md, REQ-010). Green here means "the bypass is still there", not "the
// fix works": no TRUSTED_PROXIES value closes the single-value form, only the network property
// of the app being unreachable except through a real proxy does — and that needs a real
// deployment, which still does not exist (ADR-049: k3s on Hetzner). #246 carried that gap
// until the stakeholder closed it on 2026-08-05; #274 had landed two minutes earlier, but it
// ships a *local* production-shaped Compose stack and its own merge commit says so — "what
// this deliberately does not resolve: #75 ... and #246 ... both stay open". #292 is #246's
// successor and carries the same gap and the same dependents. register-check's check 5
// (docs/requirements/register.md's citation of this file, both tables) mirrors this exact
// marker text and verifies #292 is still open — the day it closes, that citation goes red
// until re-read, which is exactly how #246's closure was caught.
//
// Deliberately a FRESH target email per attempt (unlike before #248/login-rate-limit.ts
// landed, when one fixed probe email was reused throughout): this isolates the IP-keyed
// bucket's own bypass from the new account-keyed control below, which only ever sees one
// attempt per email here and so never engages — the realistic shape of a stolen-credential
// list (many accounts, one guess each), which the account-keyed control cannot help with
// either (see that describe block's own header comment).
describe('#241 A1 — TRUSTED_PROXIES unset: today’s live bypass, kept as a permanent regression test', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    // Set immediately before booting, not at the describe body's top level — this
    // file boots several app instances with different TRUSTED_PROXIES values, and
    // Vitest collects every describe body (running its synchronous statements)
    // before any beforeAll runs, so an assignment made there would be clobbered by
    // another describe block's own assignment before either app ever boots.
    process.env.GUEST_SESSION_SECRET = 'trusted-proxies-a1-secret'
    process.env.BETTER_AUTH_SECRET = 'trusted-proxies-a1-better-auth-secret-0123'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    delete process.env.TRUSTED_PROXIES
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  beforeEach(async () => {
    await cleanUp(prisma)
  })

  afterEach(async () => {
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('a rotating single-value X-Forwarded-For never trips 429 — every request is a fresh, unaccumulated bucket, one attempt per distinct account', async () => {
    const statuses: number[] = []
    for (let i = 0; i < SIGN_IN_WINDOW_MAX + 3; i += 1) {
      // A different single XFF value AND a different, never-before-seen target email on
      // every request — createRateLimitKey(ip, path) differs every time (the IP-keyed
      // bucket this describes), and login-rate-limit.ts's account-keyed bucket never
      // accumulates past 1 either, since no email repeats.
      statuses.push(await attemptSignIn(baseUrl, `a1-target-${i}@example.com`, `203.0.113.${i + 1}`))
    }
    // Positive expectation, not an absence (Musti's review, ADR-0021: "a check states
    // its expectation independently of what it checks" — `not.toContain(429)` would
    // stay green if every request 500'd, or 404'd after a path move, or the server
    // never came up at all, none of which say anything about the bypass). Every
    // attempt is a genuine failed login against an account that does not exist (no
    // beforeEach/signUp seeds one, and afterEach's cleanUp() deletes every user row
    // regardless) — better-auth deliberately answers that the same way it answers a
    // wrong password against a real account, 401 INVALID_EMAIL_OR_PASSWORD, so the
    // endpoint can't be used to enumerate accounts; checked directly against the real
    // server before writing this assertion, not guessed. This test would go red on a
    // broken endpoint AND on a returned 429, and green only when the exact condition
    // it names actually holds.
    expect(statuses).toEqual(Array(SIGN_IN_WINDOW_MAX + 3).fill(401))
  })
})

// The positive half of #248's fix — NOT a `@documents-defect` test. Same full IP rotation
// as A1 above (so the IP-keyed bucket is, exactly as A1 shows, bypassed), but targeting the
// SAME account on every attempt. REQ-010's own GWT clause is "repeated failed logins from
// the same account/origin" — this proves the "same account" half now holds regardless of
// the caller's claimed origin/IP, closing exactly the gap #248 named without needing #292's
// real deployment topology at all: an attacker cannot rotate an email address the way they
// can rotate a header.
//
// Musti's review, PR #339, blocking finding 1: the original version of this control counted
// EVERY attempt, successes included, and never reset — so a legitimate account holder's own
// correct sign-in still consumed quota, and nothing ever gave it back. Fixed: only a FAILED
// attempt counts (`hooks.after` sees the real outcome, not `hooks.before`), and a SUCCESSFUL
// sign-in clears the bucket outright. The tests below prove both halves, not just the
// pre-existing "it blocks eventually" one.
describe('the account-keyed control (#248, ADR-0034) closes repeated guessing against ONE account, even under full IP rotation, and counts failures only', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'trusted-proxies-acct-secret'
    process.env.BETTER_AUTH_SECRET = 'trusted-proxies-acct-better-auth-secret-0123'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    delete process.env.TRUSTED_PROXIES
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  beforeEach(async () => {
    await cleanUp(prisma)
  })

  afterEach(async () => {
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('a rotating X-Forwarded-For targeting the SAME account trips 429 exactly once the account-keyed threshold is hit', async () => {
    const target = 'account-keyed-victim@example.com'
    const statuses: number[] = []
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX + 2; i += 1) {
      // Same email every time; a fresh, never-repeated XFF value every time — the IP-keyed
      // bucket alone (as A1 shows) would never trip here.
      statuses.push(await attemptSignIn(baseUrl, target, `198.51.100.${i + 1}`))
    }
    // Exact sequence, not `toContain(429)` (Musti's review, PR #339, secondary finding: the
    // old assertion would have passed even if 429 arrived on attempt 2 — i.e. if
    // LOGIN_RATE_LIMIT_MAX were silently wrong). LOGIN_RATE_LIMIT_MAX + 2 attempts: the first
    // LOGIN_RATE_LIMIT_MAX are genuine failed logins (401), the remaining 2 are blocked (429).
    expect(statuses).toEqual([...Array(LOGIN_RATE_LIMIT_MAX).fill(401), 429, 429])

    // Discriminates "429 appeared" from "429 appeared for the right reason" (same
    // discipline as A2 below): the row must be the account-keyed key specifically, not
    // some other bucket that happened to also trip.
    const row = await prisma.rateLimit.findFirst({ where: { key: loginRateLimitKey(target) } })
    expect(row).not.toBeNull()
    expect(row!.count).toBeGreaterThanOrEqual(LOGIN_RATE_LIMIT_MAX)
  })

  it('a successful sign-in clears the bucket — the account holder is not locked out by their own correct password', async () => {
    const target = 'account-keyed-legit-user@example.com'
    const password = 'a-fine-strong-password-1'
    const signUpResponse = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
      body: JSON.stringify({ email: target, password, name: 'Legit User' }),
    })
    expect(signUpResponse.status).toBe(200)
    // The hook only ever matches `ctx.path === '/sign-in/email'`, so sign-up itself never
    // writes this key — a brand-new account starts with no row at all, which is itself the
    // baseline "cleared" state this test's later assertion depends on.

    // A fresh X-Forwarded-For per call (same technique as A1/the account-keyed-guessing
    // test above) — deliberately so better-auth's OWN, unrelated, IP-keyed limiter (10s/
    // max 3) never engages here. Six correct sign-ins is otherwise indistinguishable from
    // "two devices, a re-auth, a reinstall" and must never be denied by EITHER limiter;
    // isolating the IP one out is what makes this test only about the account-keyed one.
    const signIn = async (xForwardedFor: string): Promise<number> => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com', 'x-forwarded-for': xForwardedFor },
        body: JSON.stringify({ email: target, password }),
      })
      return response.status
    }

    // Several genuine, correct-password sign-ins in a row. None of them may ever count
    // against the account-keyed limiter, however many happen.
    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      statuses.push(await signIn(`198.51.100.${200 + i}`))
    }
    expect(statuses).toEqual(Array(6).fill(200))

    // The literal proof: no row for this account's key exists after 6 correct sign-ins —
    // not merely "count is low", but genuinely absent, because every success deletes it.
    const row = await prisma.rateLimit.findFirst({ where: { key: loginRateLimitKey(target) } })
    expect(row).toBeNull()
  })

  it('a successful sign-in resets the count even after failed attempts — the next failure starts counting from zero, not from where the attacker left off', async () => {
    const target = 'account-keyed-reset-after-fail@example.com'
    const password = 'a-fine-strong-password-1'
    const signUpResponse = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
      body: JSON.stringify({ email: target, password, name: 'Reset After Fail' }),
    })
    expect(signUpResponse.status).toBe(200)

    const failedAttempt = async (): Promise<number> => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
        body: JSON.stringify({ email: target, password: 'definitely-wrong-password' }),
      })
      return response.status
    }
    const correctAttempt = async (): Promise<number> => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
        body: JSON.stringify({ email: target, password }),
      })
      return response.status
    }

    expect(await failedAttempt()).toBe(401)
    expect(await failedAttempt()).toBe(401)
    let row = await prisma.rateLimit.findFirst({ where: { key: loginRateLimitKey(target) } })
    expect(row?.count).toBe(2)

    expect(await correctAttempt()).toBe(200)
    row = await prisma.rateLimit.findFirst({ where: { key: loginRateLimitKey(target) } })
    expect(row).toBeNull()
  })
})

describe('#241 A2/A3 — TRUSTED_PROXIES configured: the fix, proven against a simulated proxy hop', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'trusted-proxies-a2-secret'
    process.env.BETTER_AUTH_SECRET = 'trusted-proxies-a2-better-auth-secret-0123'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    // A placeholder trusted-proxy CIDR (RFC 1918 private range) — deliberately NOT a
    // real ingress range (that value is #277's, itself blocked on the deployment gap
    // #292 now carries; it was written here as "a real Fly.io range" against a platform
    // premise #246's own 2026-08-05 correction retired — ADR-049 is k3s on Hetzner) and
    // deliberately NOT overlapping any test IP below (TEST-NET-2/TEST-NET-3, RFC
    // 5737), so the resolver's own hop-stripping logic is what's under test, not an
    // accidental address collision.
    process.env.TRUSTED_PROXIES = '10.0.0.0/24'
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  beforeEach(async () => {
    await cleanUp(prisma)
  })

  afterEach(async () => {
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  // The fixed value below (203.0.113.50, RFC 5737 TEST-NET-3) stands in for "the real
  // client, as correctly observed and appended by our own trusted reverse proxy" — the
  // rightmost entry in a genuine multi-hop chain. It is NOT inside TRUSTED_PROXIES
  // above, so getIPFromHeader returns it directly rather than stripping past it.
  const SIMULATED_REAL_CLIENT = '203.0.113.50'

  // One fixed target email throughout, sending SIGN_IN_WINDOW_MAX + 1 attempts (one past
  // the IP-keyed limiter's own 3-attempt window) — deliberately fewer than
  // login-rate-limit.ts's own account-keyed max (5), so THAT control never engages here;
  // this test isolates the IP-keyed dimension specifically. Musti's review, PR #339,
  // secondary finding: the previous SIGN_IN_WINDOW_MAX + 2 = 5 attempts had ZERO margin
  // against the account-keyed max (also 5) — a silent retune of either constant would have
  // made this test pass for the wrong reason. The assertion below pins that assumption so
  // it fails loudly instead.
  const ATTEMPTS = SIGN_IN_WINDOW_MAX + 1

  it('A2: the rotating fake left of a simulated real client is ignored — the limiter buckets on the correctly-resolved real IP, and the threshold trips 429 there', async () => {
    expect(LOGIN_RATE_LIMIT_MAX).toBeGreaterThan(ATTEMPTS) // isolation margin — see ATTEMPTS' own comment
    const statuses: number[] = []
    const email = 'trusted-proxies-a2-probe@example.com'
    for (let i = 0; i < ATTEMPTS; i += 1) {
      // <rotating attacker-controlled value>, <fixed simulated real client> — the
      // shape Musti's review specifies: without a genuine second hop, a rotating
      // single value still bypasses (A1); this is what actually differs once fixed.
      statuses.push(await attemptSignIn(baseUrl, email, `198.51.100.${i + 1}, ${SIMULATED_REAL_CLIENT}`))
    }
    expect(statuses).toContain(429)

    // The discriminating half, and the reason "429 appeared somewhere" alone isn't
    // enough here (measured, not assumed): a 2+-value header with NO trustedProxies
    // configured does NOT make the limiter fail open — it collapses onto a shared
    // sentinel key ('no-trusted-ip', or '127.0.0.1' under this test env's own
    // isTest()-driven fallback in getIp()) that is equally stable across every
    // caller, and THAT also trips 429 after the same three attempts — a different,
    // real problem (one global bucket for every unresolvable caller), but one that
    // would make "429 appeared" pass for entirely the wrong reason if that were the
    // only check. Asserting the literal key is what actually proves the fix: it
    // must be keyed on the real, correctly-stripped client IP, not a fallback
    // sentinel that happens to be stable too. RateLimit.key is the literal
    // `${ip}|${path}` string better-auth's own createRateLimitKey builds
    // (better-auth/dist/api/rate-limiter/index.mjs) — read directly off the row, not
    // reconstructed by this test.
    //
    // The COMPLETE set, not an arbitrary matching row (Musti's review, PR #339, blocking
    // finding 3 — the same unordered-`findFirst`-with-`contains` pattern as A0's, fixed the
    // same way: `beforeEach` above owns the precondition, so every row found here was
    // created by this test's own requests).
    const rows = await prisma.rateLimit.findMany({ where: { key: { contains: '/sign-in/email' } } })
    const distinctKeys = [...new Set(rows.map((row) => row.key))]
    expect(distinctKeys).toEqual([`${SIMULATED_REAL_CLIENT}|/sign-in/email`])
  })

  it('A3: a session created via the real sign-up/sign-in flow with a spoofed leading hop does not carry the spoofed IP', async () => {
    const spoofedAttackerValue = '192.0.2.66'
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.com',
        'x-forwarded-for': `${spoofedAttackerValue}, ${SIMULATED_REAL_CLIENT}`,
      },
      body: JSON.stringify({ email: 'a3-session-ip@example.com', password: 'a-fine-strong-password-1', name: 'A3' }),
    })
    expect(response.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'a3-session-ip@example.com' } })
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })

    expect(session.ipAddress).not.toBe(spoofedAttackerValue)
    expect(session.ipAddress).toBe(SIMULATED_REAL_CLIENT)
  })
})
