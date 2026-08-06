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
// screen looks fully authenticated — the isolated-failure shape the report described. `better-auth.ts`
// now sets `session.freshAge: 0` — see its own header comment on that block for why 0, not some
// other number (this app never wires `/change-email`/`/change-password`, the only other consumer
// of this gate, and has its own independent, purpose-built freshness window for the one genuinely
// destructive action, `fresh-auth.ts`).
//
// Real Postgres, real HTTP (never `.inject()`, same reasoning as req-009-session-model.test.ts) —
// boots via the actual `buildApp()`, never a re-assembled copy.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-014-freshness-secret'
process.env.BETTER_AUTH_SECRET = 'req-014-freshness-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0' // overwritten to the real ephemeral URL below

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

  it('a session younger than the library default freshAge can list its own sessions (sanity — this was never broken)', async () => {
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

  it('a genuinely returning user (session older than the library default freshAge, still inside its own expiresIn) can STILL list their own sessions — the exact regression the stakeholder hit', async () => {
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

  it('revoke-session was never gated by freshness (asymmetry check — a device could already be revoked on a stale session; only viewing the list was broken)', async () => {
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
})
