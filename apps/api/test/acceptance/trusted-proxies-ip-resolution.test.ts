// #241 / ADR-0106 D3 — whose address the rate limiter and Session.ipAddress key on.
// better-auth used to read X-Forwarded-For itself and, with no trusted proxies, believed a single-value
// header from anyone. It now reads the address Fastify resolved from the socket peer and TRUSTED_PROXIES.
// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`, never a mocked limiter —
// the same tier every other REQ-010 assertion runs at).
//
// A1 (no trusted proxy: a rotating header buys nothing) and A2/A3 (a trusted proxy: the real client behind
// it is the key) are two boots with their own TRUSTED_PROXIES value baked in at construction time, not one
// instance reconfigured mid-test.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

async function bootApp(port: number): Promise<{ app: NestFastifyApplication; baseUrl: string; prisma: PrismaClient }> {
  const { buildApp } = await import('../../src/main.js')
  const app = await buildApp()
  await app.listen(port, '127.0.0.1')
  const baseUrl = await app.getUrl()
  const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')
  const prisma = app.get<PrismaClient>(ENCRYPTED_PRISMA)
  return { app, baseUrl, prisma }
}

async function cleanUp(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()
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
async function attemptSignIn(baseUrl: string, xForwardedFor: string): Promise<number> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com', 'x-forwarded-for': xForwardedFor },
    body: JSON.stringify({ email: 'trusted-proxies-probe@example.com', password: 'definitely-wrong-password' }),
  })
  return response.status
}

// The single-value bypass this file used to document (#241, tracked under #292) is closed in code since
// ADR-0106 D3: better-auth no longer reads X-Forwarded-For itself but the address Fastify resolved from the
// socket peer and TRUSTED_PROXIES (`installClientIpHeader`). A1 turned from proof of the bypass into proof
// of the fix: the same rotating header now trips the limit.
describe('#241 A1 — TRUSTED_PROXIES unset: a client-supplied X-Forwarded-For buys no fresh bucket (ADR-0106 D3)', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    // Set immediately before booting, not at the describe body's top level — this
    // file boots two app instances with two different TRUSTED_PROXIES values, and
    // Vitest collects every describe body (running its synchronous statements)
    // before any beforeAll runs, so an assignment made there would be clobbered by
    // the other describe block's own assignment before either app ever boots.
    process.env.GUEST_SESSION_SECRET = 'trusted-proxies-a1-secret'
    process.env.BETTER_AUTH_SECRET = 'trusted-proxies-a1-better-auth-secret-0123'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    delete process.env.TRUSTED_PROXIES
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  afterEach(async () => {
    resetRateLimiters(app)
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('a rotating single-value X-Forwarded-For still trips 429 after the sign-in threshold', async () => {
    const statuses: number[] = []
    for (let i = 0; i < SIGN_IN_WINDOW_MAX + 3; i += 1) {
      // A different value on every request: before ADR-0106 D3 each one was a fresh bucket and all six
      // answered 401. Now the socket peer is the key, so the fourth attempt is refused.
      statuses.push(await attemptSignIn(baseUrl, `203.0.113.${i + 1}`))
    }
    expect(statuses).toEqual([...Array<number>(SIGN_IN_WINDOW_MAX).fill(401), 429, 429, 429])
  })

  it('a client cannot set the internal client-address header either', async () => {
    const statuses: number[] = []
    for (let i = 0; i < SIGN_IN_WINDOW_MAX + 1; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com', 'x-steuereule-client-ip': `198.51.100.${i + 1}` },
        body: JSON.stringify({ email: 'trusted-proxies-probe@example.com', password: 'definitely-wrong-password' }),
      })
      statuses.push(response.status)
    }
    expect(statuses).toEqual([...Array<number>(SIGN_IN_WINDOW_MAX).fill(401), 429])
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
    // The test client connects over loopback, so loopback is the trusted proxy hop: proxy-addr believes an
    // X-Forwarded-For only from a trusted peer (ADR-0106 D3).
    process.env.TRUSTED_PROXIES = '127.0.0.1,10.0.0.0/24'
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  afterEach(async () => {
    resetRateLimiters(app)
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

  it('A2: the rotating fake left of a simulated real client is ignored — the limiter buckets on the correctly-resolved real IP, and the threshold trips 429 there', async () => {
    const statuses: number[] = []
    for (let i = 0; i < SIGN_IN_WINDOW_MAX + 2; i += 1) {
      // <rotating attacker-controlled value>, <fixed simulated real client> — the
      // shape Musti's review specifies: without a genuine second hop, a rotating
      // single value still bypasses (A1); this is what actually differs once fixed.
      statuses.push(await attemptSignIn(baseUrl, `198.51.100.${i + 1}, ${SIMULATED_REAL_CLIENT}`))
    }
    expect(statuses).toContain(429)

    // The discriminating half, and the reason "429 appeared somewhere" alone isn't
    // enough here (measured, not assumed): a 2+-value header with NO trustedProxies
    // configured collapses onto a shared sentinel key that is equally stable across
    // every caller, and THAT also trips 429 after the same three attempts. This used
    // to be proven by reading better-auth's `RateLimit.key` off the (now-removed)
    // table; with better-auth's in-memory storage the equivalent proof is a fresh
    // *different* client in the same window: it must NOT be throttled. A 401 here
    // means the bucket was keyed on the correctly-resolved per-client IP
    // (`SIMULATED_REAL_CLIENT`), not a shared fallback sentinel that would also 429.
    const otherClient = await attemptSignIn(baseUrl, `198.51.100.9, 203.0.113.51`)
    expect(otherClient).toBe(401)
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
    await prisma.user.update({ where: { email: 'a3-session-ip@example.com' }, data: { emailVerified: true } })
    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.com',
        'x-forwarded-for': `${spoofedAttackerValue}, ${SIMULATED_REAL_CLIENT}`,
      },
      body: JSON.stringify({ email: 'a3-session-ip@example.com', password: 'a-fine-strong-password-1' }),
    })
    expect(signIn.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'a3-session-ip@example.com' } })
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })

    expect(session.ipAddress).not.toBe(spoofedAttackerValue)
    expect(session.ipAddress).toBe(SIMULATED_REAL_CLIENT)
  })
})
