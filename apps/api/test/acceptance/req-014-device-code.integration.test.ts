// REQ-014 — task 0: DeviceCode migration + plugin registration + POST /v1/device/code
// (#238, ADR-0024). Real Postgres, real HTTP against the actual `buildApp()` boot
// (never `.inject()` — see req-009's own header comment for why the mount is
// `.inject()`-blind).
import http from 'node:http'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-014-secret'
process.env.BETTER_AUTH_SECRET = 'req-014-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0' // overwritten to the real ephemeral URL below

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

// Deliberately a *different* origin from BETTER_AUTH_URL above (a different host
// entirely, not just a different port) — the whole point of this fixture. If
// `verificationUri` were ever dropped from the deviceAuthorization() plugin config,
// better-auth's own fallback would resolve the verification link against its
// `baseURL` (BETTER_AUTH_URL) instead, and the test below would go red.
const WEB_APP_ORIGIN = 'https://web-app.example.com'
process.env.WEB_APP_URL = WEB_APP_ORIGIN

describe('REQ-014 task 0 — device-authorization plugin registration, against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
    // The shared dev Postgres this suite runs against may already carry rows from a
    // manual boot/curl session against the same DATABASE_URL — start from a clean
    // table rather than assuming one.
    await prisma.$executeRawUnsafe(`DELETE FROM "DeviceCode"`)
  })

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "DeviceCode"`)
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  /**
   * Posts to `/v1/device/code` from a genuinely distinct *real* source address —
   * `localAddress` binds the outgoing TCP connection's own end, so the server's
   * `request.ip` (the raw socket peer, no `trustProxy`) actually differs, real HTTP,
   * no header spoofing `disableOriginCheck`/`trustProxy` would otherwise make moot.
   * 127.0.0.0/8 is all loopback on Linux — 127.0.0.2 routes to this same server
   * without any extra interface configuration, verified against this real listener.
   */
  function postDeviceCodeFrom(localAddress: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/v1/device/code`)
      const request = http.request(
        { host: url.hostname, port: url.port, path: '/v1/device/code', method: 'POST', localAddress, headers: { 'user-agent': 'RateLimitProbe/1.0' } },
        (response) => {
          response.resume()
          response.on('end', () => resolve(response.statusCode ?? 0))
        },
      )
      request.on('error', reject)
      request.end()
    })
  }

  it('the migration is applied — the DeviceCode table exists and is queryable', async () => {
    await expect(prisma.deviceCode.findMany()).resolves.toEqual([])
  })

  it('POST /v1/device/code returns a user_code/device_code pair, valid ~2 minutes', async () => {
    const response = await fetch(`${baseUrl}/v1/device/code`, {
      method: 'POST',
      headers: { 'user-agent': 'IntegrationTestAgent/1.0' },
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      userCode: string
      deviceCode: string
      verificationUriComplete: string
      expiresIn: number
      interval: number
    }
    expect(body.userCode).toEqual(expect.any(String))
    expect(body.userCode.length).toBeGreaterThan(0)
    expect(body.deviceCode).toEqual(expect.any(String))
    expect(body.verificationUriComplete).toContain(body.userCode)
    // ADR-0024: expiresIn: '2m', not the plugin's 30m default.
    expect(body.expiresIn).toBe(120)
  })

  // ADR-0021: a control is proven by breaking it. This shipped broken once already —
  // every other assertion here only checks that `userCode` appears *somewhere* in
  // `verificationUriComplete`, which is equally true whether the link points at the
  // web app or, as it did before this fix, at this very API server's own origin (a
  // phone then lands on a bare Fastify 404, no route, no HTML — the feature would
  // ship dead with every other assertion in this file green). Asserts against
  // `process.env.WEB_APP_URL` — the value's own origin — rather than a literal this
  // test would otherwise have to keep in sync by hand.
  it('the verification URL points at the web app\'s own origin, never at this API (#238)', async () => {
    const response = await fetch(`${baseUrl}/v1/device/code`, {
      method: 'POST',
      headers: { 'user-agent': 'IntegrationTestAgent/1.0' },
    })
    const body = (await response.json()) as { verificationUriComplete: string }

    expect(body.verificationUriComplete.startsWith(WEB_APP_ORIGIN)).toBe(true)
    // `baseUrl` is this test's own real, listening API server (the ephemeral
    // 127.0.0.1 port bound above) — proving the link does NOT resolve there is the
    // actual regression this guards: without `verificationUri` set explicitly, the
    // plugin's own fallback (`buildVerificationUris`) resolves against exactly this
    // origin instead.
    expect(body.verificationUriComplete.startsWith(baseUrl)).toBe(false)
  })

  it('stamps the desktop\'s own User-Agent/IP/requestedAt onto the row, status "pending"', async () => {
    const response = await fetch(`${baseUrl}/v1/device/code`, {
      method: 'POST',
      headers: { 'user-agent': 'IntegrationTestAgent/1.0' },
    })
    const body = (await response.json()) as { deviceCode: string }

    const row = await prisma.deviceCode.findUniqueOrThrow({ where: { deviceCode: body.deviceCode } })
    expect(row.status).toBe('pending')
    expect(row.userId).toBeNull()
    expect(row.requestUserAgent).toBe('IntegrationTestAgent/1.0')
    expect(row.requestedAt).not.toBeNull()
    // No GEOIP_DATABASE_PATH is configured in this test environment (task 0b's
    // resolver has nothing to load yet — matching real dev/CI before the build-time
    // fetch has run) — and the test client's own address is loopback regardless.
    // Either reason alone makes "unknown" the only honest answer; RegionResolver's
    // own three-branch behaviour is proven directly in region-resolver.geoip.test.ts.
    expect(row.requestRegion).toBe('unknown')
  })

  // ADR-0024's whole reason to exist: the plugin's own HTTP surface must be
  // unreachable directly. Proven by breaking the assumption, not merely declaring it
  // (ADR-0021) — a real request against the mounted /api/auth/* catch-all.
  it('the plugin\'s own /api/auth/device* routes are disabled — a browser cannot reach them directly', async () => {
    const directCode = await fetch(`${baseUrl}/api/auth/device/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ client_id: 'anything' }),
    })
    expect(directCode.status).toBe(404)

    const directVerify = await fetch(`${baseUrl}/api/auth/device?user_code=AAAAAAAA`)
    expect(directVerify.status).toBe(404)
  })

  // Musti's #239 ruling: not the entropy margin (an attacker-minted code is worthless
  // to guess — it points at the attacker's own desktop) but write-amplification — an
  // unauthenticated, unthrottled mint writes a permanent row nothing ever deletes
  // (~14.9 GB/day measured against real Postgres at local write capacity). Three
  // assertions, each killing a different broken limiter (ADR-0021):
  it('POST /v1/device/code is rate-limited at window 60s / max 10 per IP — the write-amplification ADR-0024 names', async () => {
    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      lastStatus = await postDeviceCodeFrom('127.0.0.1')
    }
    // (1) the 11th mint from the same IP within the window is rejected.
    expect(lastStatus).toBe(429)

    // (2) and writes no row — a limiter that inserts-then-429s would still pass (1)
    // alone; the 10 allowed mints above are the only rows that may exist.
    await expect(prisma.deviceCode.count()).resolves.toBe(10)

    // (3) a different IP within the very same window still gets 201 — the
    // discriminating half: a limiter that rejects everything unconditionally would
    // otherwise pass (1) and (2) too.
    const otherIpStatus = await postDeviceCodeFrom('127.0.0.2')
    expect(otherIpStatus).toBe(201)
  })
})
