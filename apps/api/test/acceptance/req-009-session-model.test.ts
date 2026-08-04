// REQ-009 — Session/token storage model (ADR-0012 §2/§3). Real Postgres, real HTTP
// (never `.inject()` — the whole point of §1's Fastify mount is `.inject()`-blind, so
// this suite proves it via a real listening socket + `fetch`, exactly like
// cors.acceptance.test.ts). Boots via the *actual* `buildApp()` from src/main.ts —
// not a re-assembled copy — so this can never silently drift from production wiring.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-009-secret'
process.env.BETTER_AUTH_SECRET = 'req-009-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0' // overwritten to the real ephemeral URL below

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const SIGNUP_PAYLOAD = { email: 'req009@example.com', password: 'a-fine-strong-password-1', name: 'Req 009' }

// Node's own `fetch()` (undici) sends `Sec-Fetch-Mode: cors` by default on every
// request — exactly the Fetch-Metadata signal better-auth's CSRF middleware uses to
// decide a request needs origin validation (ADR-0012 §5/REQ-010), same as a real
// browser fetch(). A real browser call to a state-changing auth endpoint always
// carries a matching Origin header too, so every such call here does the same —
// omitting it here would silently test something no real browser client sends.
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

describe('REQ-009 — session/token storage model, against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    // better-auth needs its own real base URL to build absolute links; the ephemeral
    // port isn't known until after listen(), so resolveBetterAuthUrl's env lookup
    // must be set correctly before buildApp() runs. Since we don't need real
    // absolute-link correctness for this suite (no verification-link assertions
    // here — see req-005), a fixed loopback placeholder is fine.
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39999'

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
    // The sandbox/CI test runner calls sign-up-email over plain loopback HTTP with no
    // forwarded client IP, so better-auth's login rate limiter (REQ-010) falls back to
    // one shared bucket for every caller (a real, logged warning — "Rate limiting
    // could not determine a client IP"). Left uncleaned, repeated signups across
    // these tests (and other acceptance files sharing this same Postgres) would trip
    // that bucket and fail this suite for an unrelated reason.
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('given a user signs in on web, the session cookie is httpOnly, Secure, SameSite=None, unreadable by client JS', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(SIGNUP_PAYLOAD),
    })
    expect(response.status).toBe(200)

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/SameSite=None/i)
  })

  it('the session is server-side, DB-backed and revocable: server-side revoke invalidates the token on its next use', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ ...SIGNUP_PAYLOAD, email: 'req009-revoke@example.com' }),
    })
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

    const beforeRevoke = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    expect(await beforeRevoke.json()).not.toBeNull()

    // Revoke server-side (simulating "sign out everywhere") by deleting the session
    // row directly — proves revocation is enforced server-side, not just client-side.
    await prisma.session.deleteMany({ where: { user: { email: 'req009-revoke@example.com' } } })

    const afterRevoke = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    expect(await afterRevoke.json()).toBeNull()
  })

  it('a verified better-auth session wins over UserContextGuard’s guest fallback — Profile is scoped to the real account id', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ ...SIGNUP_PAYLOAD, email: 'req009-guard@example.com' }),
    })
    const body = (await signUp.json()) as { user: { id: string } }
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Real', lastName: 'Account', steuerId: '02476291358', steuernummer: null }),
    })
    expect(put.status).toBe(200)
    // No guest cookie minted alongside a verified session (ADR-0012 §2).
    expect(put.headers.get('set-cookie')).toBeNull()

    const row = await prisma.profile.findUnique({ where: { userId: body.user.id } })
    expect(row).not.toBeNull()
  })

  // Nested under its own REQ-002 tag (Musti's #253 precedent, applied here): this `it`
  // proves REQ-002's guest-cookie-mint clause against the real deployed artifact — real
  // `buildApp()`, real socket, real Postgres — it was just sitting untagged in this
  // REQ-009 file. Dropping the register's citation would delete real evidence and pull
  // REQ-002 back to `green (unit)`; tagging it here makes the citation match the file's
  // own describe() tree instead.
  describe('REQ-002 — an unauthenticated request still gets a guest session', () => {
    it('an unauthenticated request (no cookie at all) still gets a guest session — I/O-free, no better-auth session lookup involved', async () => {
      const response = await fetch(`${baseUrl}/v1/profile`)
      expect(response.status).toBe(200)
      expect(response.headers.get('set-cookie')).toMatch(/se_guest_session=/)
    })
  })
})
