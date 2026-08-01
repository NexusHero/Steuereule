// REQ-014 — task 0: DeviceCode migration + plugin registration + POST /v1/device/code
// (#238, ADR-0024). Real Postgres, real HTTP against the actual `buildApp()` boot
// (never `.inject()` — see req-009's own header comment for why the mount is
// `.inject()`-blind).
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
  })

  afterAll(async () => {
    await app.close()
  })

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
})
