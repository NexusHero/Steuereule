// REQ-011 (#48) — DSGVO data export, the BE-A "export" slice of ADR-0013. Real
// Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`), real
// Chromium via PlaywrightPdfRenderer (ADR-0013 §7) — the full T1 round-trip, not an
// approximation of it. Account deletion (BE-B, DELETE /v1/account) is Enis's sibling
// slice and is intentionally out of scope here.
//
// Named after the acceptance criterion, not an implementation file, per this suite's
// own convention (see req-005/006/009/010): this is the ATDD gate CI's `integration`
// job runs, distinct from account-export.integration.test.ts's finer-grained,
// developer-level Postgres/wiring proofs.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-011-export-secret'
process.env.BETTER_AUTH_SECRET = 'req-011-export-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const PROFILE_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

describe('REQ-011 — DSGVO data export (Art. 15/20), against the real server', () => {
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
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.rateLimit.deleteMany()
  })

  afterEach(async () => {
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUpAndSaveProfile(
    email: string,
    profile: typeof PROFILE_PAYLOAD = PROFILE_PAYLOAD,
  ): Promise<{ cookie: string; userId: string }> {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Anna Beispiel' }),
    })
    expect(signUp.status).toBe(200)
    const body = (await signUp.json()) as { user: { id: string } }
    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(profile),
    })
    expect(put.status).toBe(200)

    return { cookie, userId: body.user.id }
  }

  it('JSON export returns the assembled data set (account + decrypted profile + empty taxData + own access log)', async () => {
    const { cookie } = await signUpAndSaveProfile('acceptance-json@example.com')

    const response = await fetch(`${baseUrl}/v1/account/export?format=json`, { headers: { cookie } })

    expect(response.status).toBe(200)
    const document = (await response.json()) as {
      schemaVersion: string
      account: { email: string }
      profile: typeof PROFILE_PAYLOAD & { createdAt: string; updatedAt: string }
      taxData: unknown[]
      accessLog: unknown[]
    }
    expect(document.schemaVersion).toBe('1.0')
    expect(document.account.email).toBe('acceptance-json@example.com')
    expect(document.profile).toMatchObject(PROFILE_PAYLOAD)
    expect(document.taxData).toEqual([])
    expect(Array.isArray(document.accessLog)).toBe(true)
  })

  it('PDF export returns a real PDF document via the PdfRenderer seam (real Chromium, not a stub)', async () => {
    const { cookie } = await signUpAndSaveProfile('acceptance-pdf@example.com')

    const response = await fetch(`${baseUrl}/v1/account/export?format=pdf`, { headers: { cookie } })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/pdf/)
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('trust boundary: user A cannot export user B’s data — there is no id parameter to forge, only the guard-derived session', async () => {
    const userA = await signUpAndSaveProfile('acceptance-a@example.com', PROFILE_PAYLOAD)
    const userB = await signUpAndSaveProfile('acceptance-b@example.com', {
      ...PROFILE_PAYLOAD,
      firstName: 'Jonas',
      steuerId: '65929970489',
    })

    const exportA = (await (await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie: userA.cookie } })).json()) as {
      profile: { firstName: string }
    }
    const exportB = (await (await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie: userB.cookie } })).json()) as {
      profile: { firstName: string }
    }

    expect(exportA.profile.firstName).toBe('Anna')
    expect(exportB.profile.firstName).toBe('Jonas')

    // No id parameter exists anywhere on the route to smuggle another user's id
    // through — attempting one is rejected outright by the whitelisted DTO, never
    // silently ignored or honoured.
    const spoofAttempt = await fetch(`${baseUrl}/v1/account/export?userId=${userB.userId}`, {
      headers: { cookie: userA.cookie },
    })
    expect(spoofAttempt.status).toBe(400)
  })

  it('secrets are never exported: no password hash, no session/verification token, ever', async () => {
    const { cookie, userId } = await signUpAndSaveProfile('acceptance-secrets@example.com')
    const account = await prisma.account.findFirst({ where: { userId, providerId: 'credential' } })
    expect(account?.password).toBeTruthy()

    const jsonBody = await (await fetch(`${baseUrl}/v1/account/export?format=json`, { headers: { cookie } })).text()
    expect(jsonBody.toLowerCase()).not.toContain(account!.password!.toLowerCase())
    for (const forbidden of ['password', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'verificationtoken']) {
      expect(jsonBody.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('every export (both formats) appends exactly one READ/export audit entry — the Art. 30 accountability record for this access', async () => {
    const { cookie, userId } = await signUpAndSaveProfile('acceptance-audit@example.com')

    await fetch(`${baseUrl}/v1/account/export?format=json`, { headers: { cookie } })
    await fetch(`${baseUrl}/v1/account/export?format=pdf`, { headers: { cookie } })

    const exportReads = await prisma.taxDataAccessLog.findMany({
      where: { userId, action: 'READ', resource: 'export' },
    })
    expect(exportReads).toHaveLength(2)
  })

  it('a guest session that never signed up has no account to export — an honest 404, not a fabricated empty document', async () => {
    const response = await fetch(`${baseUrl}/v1/account/export`)
    expect(response.status).toBe(404)
  })
})
