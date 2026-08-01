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
    // task 0b's RegionResolver hasn't landed yet at this point in the row's write
    // path — requestRegion stays null rather than a guessed value.
    expect(row.requestRegion).toBeNull()
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
