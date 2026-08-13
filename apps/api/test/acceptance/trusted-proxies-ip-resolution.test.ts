// #241 → #350. This file used to document a *permanent, unfixed* defect (A1: "a
// rotating single-value X-Forwarded-For never trips 429" — better-auth's own
// `getIp()` reads client-supplied headers only, so with TRUSTED_PROXIES unset a
// single-value header was trusted verbatim, and register.md's REQ-010 row carried
// the `documents-defect` marker for #292 on the claim that only a real deployment's network
// property — the app being unreachable except through a real proxy — could close it).
//
// #350 (Musti's ruling, "fix resolution, not the limiter") closes that specific gap
// in CODE, independent of #292/#277: better-auth is no longer pointed at
// `x-forwarded-for` at all. `advanced.ipAddress.ipAddressHeaders` now names ONLY
// `CLIENT_ADDRESS_HEADER` (better-auth.ts), which `stamp-client-address.ts` stamps
// from the real socket peer (`request.ip` — already the true TCP peer today; no
// `trustProxy` is configured on `FastifyAdapter()`) on every request, overwriting
// (never trusting) anything a caller sends. The `documents-defect` marker for #292 is
// therefore DROPPED from this file: the defect it named is fixed, and re-adding it
// would leave register-check's check 5 asserting an open issue against a closed gap.
// What #292 still gates is unchanged and out of #350's scope: whether a real
// deployment exists to configure a real TRUSTED_PROXIES CIDR value at all (#277), and
// the residual "attacker connects directly, bypassing the real proxy entirely" case
// once TRUSTED_PROXIES names a real range (see client-address.ts's own header
// comment) — a network property, not something any header-based resolver can close.
//
// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`).
// Two describe blocks below use a GENUINE second loopback peer
// (`RawRequestOptions.localAddress`, test/support/raw-request.ts) rather than only a
// header value standing in for one — the stakeholder's own proof obligation
// ("provable locally on loopback with a real proxy hop", #350) — because the seam
// deliberately anchors trust in the real TCP peer, which a header-only simulation
// cannot exercise.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { rawRequest } from '../support/raw-request.js'

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

// Deliberately NOT tied to the exact sign-in ceiling number (3 today, 5 once #350's
// own second commit lands) — that exact threshold is proven by
// req-010-rate-limit-ceilings.test.ts instead. This file only needs "enough attempts
// to trip whichever ceiling is configured", so it stays correct across that change
// without a second edit.
const ENOUGH_ATTEMPTS_TO_TRIP_EITHER_CEILING = 6

// A trusted Origin, matching CORS_ALLOWED_ORIGINS below — without it, better-auth's
// own origin-check middleware rejects the request with 403 before ever reaching
// credential validation (checked directly against the real server, not assumed).
async function attemptSignIn(baseUrl: string, options: { xForwardedFor?: string; localAddress?: string; email?: string } = {}): Promise<number> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://allowed.example.com' }
  if (options.xForwardedFor) headers['x-forwarded-for'] = options.xForwardedFor
  const response = await rawRequest(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    ...(options.localAddress ? { localAddress: options.localAddress } : {}),
    body: JSON.stringify({ email: options.email ?? 'trusted-proxies-probe@example.com', password: 'definitely-wrong-password' }),
  })
  return response.status
}

describe('#350 — TRUSTED_PROXIES unset: distinct real peers get distinct, unforgeable rate-limit keys', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'ip-seam-a-secret'
    process.env.BETTER_AUTH_SECRET = 'ip-seam-a-better-auth-secret-0123456789'
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

  // The direct successor to the old A1: it used to prove a rotating spoofed
  // X-Forwarded-For value let an attacker evade the limiter entirely (every request
  // a fresh bucket). Under the seam that header is never read by better-auth at all
  // — CLIENT_ADDRESS_HEADER is the only entry in `ipAddressHeaders`, and it is
  // overwritten from the real socket peer on every request — so a rotating spoofed
  // value now has NO effect: every attempt from this one real peer lands in the
  // SAME bucket regardless of what it claims.
  it('a rotating spoofed X-Forwarded-For no longer creates a fresh bucket per request — the key is the peer, not the header', async () => {
    const statuses: number[] = []
    for (let i = 0; i < ENOUGH_ATTEMPTS_TO_TRIP_EITHER_CEILING; i += 1) {
      statuses.push(await attemptSignIn(baseUrl, { xForwardedFor: `203.0.113.${i + 1}`, localAddress: '127.0.0.1' }))
    }
    expect(statuses).toContain(429)

    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: '/sign-in/email' } } })
    // Validity: the persisted key is the real peer, never the sentinel fallback
    // ('no-trusted-ip', the old shared-bucket key) and never any of the spoofed
    // values this loop sent.
    expect(row?.key).toBe('127.0.0.1|/sign-in/email')
  })

  // The acceptance criterion, literally: "Given two clients on distinct source
  // addresses, when one exhausts the sign-in ceiling, then the other's next
  // sign-in is unaffected — and the exhausted client's key is the socket peer, not
  // a value it sent." Two GENUINE loopback peers (127.0.0.1, 127.0.0.2) — not one
  // peer with two header values.
  it('two distinct real peers: exhausting one never affects the other, and each key is its own peer', async () => {
    const peerAStatuses: number[] = []
    for (let i = 0; i < ENOUGH_ATTEMPTS_TO_TRIP_EITHER_CEILING; i += 1) {
      peerAStatuses.push(await attemptSignIn(baseUrl, { localAddress: '127.0.0.1', email: 'peer-a@example.com' }))
    }
    expect(peerAStatuses).toContain(429)

    // Peer B's very first attempt — a fresh, distinct real socket peer — must not
    // already be blocked by peer A's exhausted bucket.
    const peerBFirstStatus = await attemptSignIn(baseUrl, { localAddress: '127.0.0.2', email: 'peer-b@example.com' })
    expect(peerBFirstStatus).not.toBe(429)

    const rows = await prisma.rateLimit.findMany({ where: { key: { contains: '/sign-in/email' } } })
    const keys = rows.map((r) => r.key)
    expect(keys).toContain('127.0.0.1|/sign-in/email')
    // Peer B's own row exists and is keyed on ITS peer — distinct from peer A's,
    // and unaffected by however many attempts peer A already made.
    const peerBRow = rows.find((r) => r.key === '127.0.0.2|/sign-in/email')
    expect(peerBRow).toBeDefined()
    expect(peerBRow?.count).toBe(1)
  })
})

describe('#350 — TRUSTED_PROXIES configured: a real second peer standing in for the trusted proxy', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  // A real, distinct loopback address (not 127.0.0.1 — every other describe block in
  // this file uses that one) stands in for "our own trusted reverse proxy" — a
  // GENUINE second TCP peer, not a header fiction. In a real deployment this would
  // be the proxy's actual address; here it's a second loopback address this test
  // itself connects from, exercised via `rawRequest`'s `localAddress`.
  const PROXY_PEER = '127.0.0.9'

  // Stands in for "the real client, as correctly observed and appended by our own
  // trusted reverse proxy" — the rightmost entry of the X-Forwarded-For chain the
  // (real, but simulated-by-address) proxy would have set. RFC 5737 TEST-NET-3, not
  // inside TRUSTED_PROXIES below, so getIPFromHeader returns it directly rather than
  // stripping past it.
  const SIMULATED_REAL_CLIENT = '203.0.113.50'

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'ip-seam-b-secret'
    process.env.BETTER_AUTH_SECRET = 'ip-seam-b-better-auth-secret-0123456789'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    process.env.TRUSTED_PROXIES = `${PROXY_PEER}/32`
    ;({ app, baseUrl, prisma } = await bootApp(0))
  })

  afterEach(async () => {
    await cleanUp(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  it('the rotating fake left of a real proxy hop is ignored — the limiter buckets on the correctly-peeled real client', async () => {
    const statuses: number[] = []
    for (let i = 0; i < ENOUGH_ATTEMPTS_TO_TRIP_EITHER_CEILING; i += 1) {
      // <rotating attacker-controlled value>, <fixed simulated real client> — exactly
      // what a well-behaved proxy at PROXY_PEER would have forwarded, having itself
      // received a spoofed leading hop from whoever connected to it.
      statuses.push(await attemptSignIn(baseUrl, { xForwardedFor: `198.51.100.${i + 1}, ${SIMULATED_REAL_CLIENT}`, localAddress: PROXY_PEER }))
    }
    expect(statuses).toContain(429)

    // The discriminating half (unchanged from the old A2's own reasoning): "429
    // appeared somewhere" alone would also be true of a shared-sentinel fallback.
    // The literal key is what actually proves the chain was peeled correctly: our
    // own seam appended PROXY_PEER to the received chain
    // (`198.51.100.i, 203.0.113.50` → `198.51.100.i, 203.0.113.50, 127.0.0.9`), and
    // better-auth's own getIPFromHeader — untouched, not reimplemented here — walked
    // from the right, matched PROXY_PEER against TRUSTED_PROXIES and skipped it,
    // then returned the next (untrusted) entry: the real client.
    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: '/sign-in/email' } } })
    expect(row?.key).toBe(`${SIMULATED_REAL_CLIENT}|/sign-in/email`)
  })

  it('a session created via the real sign-up flow through the proxy hop does not carry the spoofed leading IP', async () => {
    const spoofedAttackerValue = '192.0.2.66'
    const response = await rawRequest(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      localAddress: PROXY_PEER,
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.com',
        'x-forwarded-for': `${spoofedAttackerValue}, ${SIMULATED_REAL_CLIENT}`,
      },
      body: JSON.stringify({ email: 'proxy-hop-session-ip@example.com', password: 'a-fine-strong-password-1', name: 'Proxy Hop' }),
    })
    expect(response.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'proxy-hop-session-ip@example.com' } })
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })

    expect(session.ipAddress).not.toBe(spoofedAttackerValue)
    expect(session.ipAddress).not.toBe(PROXY_PEER)
    expect(session.ipAddress).toBe(SIMULATED_REAL_CLIENT)
  })
})
