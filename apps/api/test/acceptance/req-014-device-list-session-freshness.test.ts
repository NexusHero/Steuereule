// REQ-014's "individually listed" clause, regression guard. Stakeholder report (real,
// cross-origin compose-stack repro): `GET /v1/profile` and `GET /api/auth/get-session` both
// succeed on a returning user's session — the header renders name + Steuer-ID — while the SAME
// screen's device list ("Angemeldete Geräte") shows a generic "check your connection" error.
//
// Root cause, found by reproducing over real cross-origin HTTP (never suspected from `.inject()`
// or from reading code alone): better-auth's own `listSessions()` endpoint carries
// `freshSessionMiddleware` (`better-auth/dist/api/routes/session.mjs:375-401`), which 403s with
// `SESSION_NOT_FRESH` once `Date.now() - session.createdAt >= session.freshAge` — default 86400s
// (24h), unrelated to the session's own 7-day `expiresIn`. Neither `/v1/profile` nor
// `/api/auth/get-session` runs that middleware, so exactly one call fails while the rest of the
// screen looks fully authenticated — the isolated-failure shape the report described.
// `better-auth.ts` now sets `session.freshAge: 0` — full reasoning, the exhaustive two-endpoint
// consumer list, and the accepted `/unlink-account` trade-off are recorded in **ADR-0027**, not
// restated here.
//
// Real Postgres, real HTTP (never `.inject()`, same reasoning as req-009-session-model.test.ts) —
// boots via the actual `buildApp()`, never a re-assembled copy.
//
// Musti's #299 review, in one line: two of the four `it`s below (the fresh-session sanity check
// and the revoke-session asymmetry check) pass identically before AND after the fix — they are
// CONTROLS that isolate the defect to exactly one endpoint, not regression guards on the change
// itself. Said explicitly on each, not left for a reader to notice by re-running them against
// main. Only the second `it` (the aged list-sessions call) and the fourth (the accepted
// `/unlink-account` loss, ADR-0027) are regression guards on this PR's own change.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-014-freshness-secret'
process.env.BETTER_AUTH_SECRET = 'req-014-freshness-better-auth-secret-0123456789'
// Placeholder only — unlike `baseUrl` below (the real ephemeral URL `app.listen(0, ...)` binds
// to), `BETTER_AUTH_URL`/`resolveBetterAuthUrl()` is read once at `createBetterAuth()` construction
// time, before the real port is known, and nothing in this file ever exercises a path that reads
// `baseURL` back (no redirect/callback assertions here — see req-005-email-signup.test.ts for
// those). The fixed port below can't collide with `app.listen(0, ...)`'s own dynamically-assigned
// one because this tier runs `fileParallelism: false` (vitest.integration.config.ts) — one file at
// a time, never a second file racing this same literal (Musti's #299 review, F4).
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

// A day past better-auth's own default `session.freshAge` (86400s) — the exact boundary the
// stakeholder's report crossed simply by leaving a local stack running/reopening the app the next
// day. Chosen relative to the library's own documented default, not to this app's (now-neutralised)
// setting, so this test still means the same thing if `session.freshAge`'s value is ever revisited.
const PAST_DEFAULT_FRESH_AGE_MS = 25 * 60 * 60 * 1000

describe('REQ-014 — device list session freshness (list-sessions must not require a fresh sign-in)', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39998'
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
    // Same reasoning as req-009-session-model.test.ts's own afterEach: this sandbox can't
    // resolve a real client IP, so better-auth's login rate limiter shares one bucket across
    // every caller in this file (and any other acceptance file sharing this Postgres) unless
    // cleaned between tests.
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('[control, not a regression guard — passes identically before and after this PR] a session younger than the library default freshAge can list its own sessions', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req014-fresh@example.com', password: 'a-fine-strong-password-1', name: 'Req 014 Fresh' }),
    })
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

    const listSessions = await fetch(`${baseUrl}/api/auth/list-sessions`, { headers: { cookie, ...TRUSTED_ORIGIN_HEADERS } })
    expect(listSessions.status).toBe(200)
  })

  it('[regression guard] a genuinely returning user (session older than the library default freshAge, still inside its own expiresIn) can STILL list their own sessions — the exact regression the stakeholder hit', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req014-stale@example.com', password: 'a-fine-strong-password-1', name: 'Req 014 Stale' }),
    })
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

    // Age the real session row directly — the real-world equivalent of "signed in
    // yesterday, opened the app again today", never a fabricated cookie.
    await prisma.session.updateMany({
      where: { user: { email: 'req014-stale@example.com' } },
      data: { createdAt: new Date(Date.now() - PAST_DEFAULT_FRESH_AGE_MS) },
    })

    // The two calls the stakeholder's report proved still succeed on this same aged session —
    // asserted here too, so a future change can't "fix" list-sessions by accidentally breaking
    // these instead.
    const profile = await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })
    expect(profile.status).toBe(200)
    const getSession = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    expect(getSession.status).toBe(200)
    expect(await getSession.json()).not.toBeNull()

    // The one call that was broken (403 SESSION_NOT_FRESH pre-fix — see this file's header
    // comment for the exact body better-auth returns without `session.freshAge: 0`).
    const listSessions = await fetch(`${baseUrl}/api/auth/list-sessions`, { headers: { cookie, ...TRUSTED_ORIGIN_HEADERS } })
    expect(listSessions.status).toBe(200)
    const sessions = (await listSessions.json()) as unknown[]
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)
  })

  it('[control, not a regression guard — passes identically before and after this PR] revoke-session was never gated by freshness — a device could already be revoked on a stale session; only viewing the list was broken', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req014-revoke@example.com', password: 'a-fine-strong-password-1', name: 'Req 014 Revoke' }),
    })
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!
    const body = (await signUp.json()) as { token: string }

    await prisma.session.updateMany({
      where: { user: { email: 'req014-revoke@example.com' } },
      data: { createdAt: new Date(Date.now() - PAST_DEFAULT_FRESH_AGE_MS) },
    })

    const revoke = await fetch(`${baseUrl}/api/auth/revoke-session`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ token: body.token }),
    })
    expect(revoke.status).toBe(200)
  })

  // ADR-0027's pinned trade-off (Musti's #299 review, F2): `/unlink-account` is the OTHER real
  // consumer of `freshSessionMiddleware` in better-auth 1.6.24 (`dist/api/routes/account.mjs:229`)
  // — setting `session.freshAge: 0` removes its freshness requirement too, not only
  // `list-sessions`'s. This asserts the ACCEPTED post-fix behaviour (unlink succeeds on an aged
  // session) so that trade-off is a recorded decision a future change can deliberately revisit,
  // not an unexamined side effect nobody wrote a test against.
  it('[regression guard, ADR-0027] session.freshAge: 0 also removes /unlink-account\'s freshness requirement — asserted, not merely stated', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req014-unlink@example.com', password: 'a-fine-strong-password-1', name: 'Req 014 Unlink' }),
    })
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!
    const signUpBody = (await signUp.json()) as { user: { id: string } }

    // `/unlink-account` refuses to remove a caller's only linked account
    // (`FAILED_TO_UNLINK_LAST_ACCOUNT`, account.mjs) unconditionally — a real second, linked
    // provider is required to reach the freshness check at all. Real OAuth cannot run in this
    // suite, so the second `Account` row is inserted directly (the same "construct the real DB
    // state, never a fabricated cookie" convention the other tests in this file already use for
    // an aged `Session` row) — this is exactly the row better-auth's own `/callback/google` would
    // have written had the OAuth round trip actually happened.
    await prisma.account.create({
      data: {
        userId: signUpBody.user.id,
        providerId: 'google',
        accountId: 'req014-unlink-google-sub',
      },
    })

    await prisma.session.updateMany({
      where: { user: { email: 'req014-unlink@example.com' } },
      data: { createdAt: new Date(Date.now() - PAST_DEFAULT_FRESH_AGE_MS) },
    })

    const unlink = await fetch(`${baseUrl}/api/auth/unlink-account`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ providerId: 'google' }),
    })
    expect(unlink.status).toBe(200)
    expect(await unlink.json()).toEqual({ status: true })
  })
})
