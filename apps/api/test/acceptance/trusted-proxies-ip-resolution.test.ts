// #241 — X-Forwarded-For trusted verbatim: better-auth's built-in rate limiter and
// Session.ipAddress both key on getIp(), which reads X-Forwarded-For and, with
// `advanced.ipAddress.trustedProxies` unset, trusts a single-value header outright.
// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`,
// never a mocked limiter — the same tier every other REQ-010 assertion runs at).
//
// A1 and A2 are deliberately NOT the same test with a switch (Musti's review): A1
// proves the break and stays as a permanent regression test after the fix lands
// (ADR-0021's own scope test — delete it, and nothing else here would catch its
// return), A2 proves the repair. Each app instance below is booted with its own
// TRUSTED_PROXIES value baked in at construction time, so A1's app and A2/A3's app
// are two separate boots, not one instance reconfigured mid-test.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

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
async function attemptSignIn(baseUrl: string, xForwardedFor: string): Promise<number> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com', 'x-forwarded-for': xForwardedFor },
    body: JSON.stringify({ email: 'trusted-proxies-probe@example.com', password: 'definitely-wrong-password' }),
  })
  return response.status
}

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
describe('#241 A1 — TRUSTED_PROXIES unset: today’s live bypass, kept as a permanent regression test', () => {
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
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('a rotating single-value X-Forwarded-For never trips 429 — every request is a fresh, unaccumulated bucket', async () => {
    const statuses: number[] = []
    for (let i = 0; i < SIGN_IN_WINDOW_MAX + 3; i += 1) {
      // A different single value on every request — createRateLimitKey(ip, path)
      // therefore differs every time, so no bucket ever accumulates past 1.
      statuses.push(await attemptSignIn(baseUrl, `203.0.113.${i + 1}`))
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
    const rateLimitRow = await prisma.rateLimit.findFirst({ where: { key: { contains: '/sign-in/email' } } })
    expect(rateLimitRow?.key).toBe(`${SIMULATED_REAL_CLIENT}|/sign-in/email`)
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
