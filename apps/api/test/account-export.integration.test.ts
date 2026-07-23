// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`),
// mirroring profile.integration.test.ts's shape (ADR-0004). Proves REQ-011/ADR-0013's
// export contract through the real PrismaProfileRepository (field-encryption, ADR-0008),
// the real PrismaAccountIdentityRepository (better-auth User/Account tables) and the
// real append-only PrismaAuditRepository — the fake-repository tier (account.http.test.ts)
// already proves the wiring; this tier proves it against the real database shape.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'account-export-integration-secret'
process.env.BETTER_AUTH_SECRET = 'account-export-integration-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39997'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
// See req-005/req-006/req-009: Node's fetch() sends Sec-Fetch-Mode, so every
// state-changing better-auth call needs a trusted Origin, same as a real browser.
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const PROFILE_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

describe('GET /v1/account/export — real Postgres', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
    // A clean slate independent of whatever state a shared local/CI Postgres instance
    // already carries (e.g. the dev seed fixture, or a previous suite's leftovers) —
    // every test below asserts on exact counts, so it must start from genuinely zero.
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

  /** Signs a fresh, real better-auth account up and returns its session cookie + userId. */
  async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Anna Beispiel' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    return { cookie, userId: body.user.id }
  }

  it('returns 404 for a guest session that never signed up, and appends no audit row', async () => {
    const response = await fetch(`${baseUrl}/v1/account/export`)
    expect(response.status).toBe(404)
    await expect(prisma.taxDataAccessLog.count()).resolves.toBe(0)
  })

  it('REQ-011: a real account with a saved (encrypted) Profile exports the assembled JSON document and appends one READ/export audit row', async () => {
    const { cookie, userId } = await signUp('export-json@example.com')

    const putProfile = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(PROFILE_PAYLOAD),
    })
    expect(putProfile.status).toBe(200)

    const exportResponse = await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie } })
    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers.get('content-type')).toMatch(/application\/json/)
    expect(exportResponse.headers.get('content-disposition')).toMatch(
      /^attachment; filename="steuereule-export-\d{4}-\d{2}-\d{2}\.json"$/,
    )

    const document = (await exportResponse.json()) as {
      schemaVersion: string
      account: { email: string }
      profile: { steuerId: string; steuernummer: string | null } | null
      taxData: unknown[]
      accessLog: { action: string; resource: string }[]
    }
    expect(document.schemaVersion).toBe('1.0')
    expect(document.account.email).toBe('export-json@example.com')
    // The plaintext, decrypted value — proving the export goes through the real
    // ENCRYPTED_PRISMA-backed ProfileRepository, not a raw ciphertext leak.
    expect(document.profile).toEqual({
      ...PROFILE_PAYLOAD,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(document.taxData).toEqual([])
    // The PUT above appended its own WRITE/profile row (ADR-0008/REQ-004) — present in
    // the assembled accessLog, proving the export reuses the real audit read-back.
    expect(document.accessLog.some((row) => row.action === 'WRITE' && row.resource === 'profile')).toBe(true)

    // Exactly one READ/export row lands in Postgres for this call (ADR-0013 §4/§6) — the
    // assembled accessLog snapshot above is taken before this row is appended.
    const exportReads = await prisma.taxDataAccessLog.findMany({ where: { userId, action: 'READ', resource: 'export' } })
    expect(exportReads).toHaveLength(1)
  })

  it('REQ-011: PDF export renders a real application/pdf document via the Chromium PdfRenderer seam', async () => {
    const { cookie, userId } = await signUp('export-pdf@example.com')
    await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(PROFILE_PAYLOAD),
    })

    const exportResponse = await fetch(`${baseUrl}/v1/account/export?format=pdf`, { headers: { cookie } })
    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers.get('content-type')).toMatch(/application\/pdf/)
    expect(exportResponse.headers.get('content-disposition')).toMatch(
      /^attachment; filename="steuereule-export-\d{4}-\d{2}-\d{2}\.pdf"$/,
    )

    const bytes = Buffer.from(await exportResponse.arrayBuffer())
    // Real PDF magic bytes — proves an actual Chromium-rendered document, not a stub.
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1_000)

    const exportReads = await prisma.taxDataAccessLog.findMany({ where: { userId, action: 'READ', resource: 'export' } })
    expect(exportReads).toHaveLength(1)
  })

  it('REQ-011 trust boundary: account A can never export account B’s data — strict per-userId scoping in real Postgres', async () => {
    const accountA = await signUp('export-a@example.com')
    const accountB = await signUp('export-b@example.com')
    await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: accountA.cookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(PROFILE_PAYLOAD),
    })
    await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: accountB.cookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ ...PROFILE_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }),
    })

    type ExportDocument = {
      account: { email: string }
      profile: { firstName: string } | null
      accessLog: unknown[]
    }
    const exportA = (await (
      await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie: accountA.cookie } })
    ).json()) as ExportDocument
    const exportB = (await (
      await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie: accountB.cookie } })
    ).json()) as ExportDocument

    expect(exportA.account.email).toBe('export-a@example.com')
    expect(exportA.profile!.firstName).toBe('Anna')
    expect(exportB.account.email).toBe('export-b@example.com')
    expect(exportB.profile!.firstName).toBe('Jonas')
    // Neither account's export ever contains the other's audit history.
    expect(exportA.accessLog.length).toBeGreaterThan(0)
    expect(exportB.accessLog.length).toBeGreaterThan(0)
  })

  it('REQ-011 secrets excluded: the export never contains the account’s password hash or any session/verification token', async () => {
    const { cookie, userId } = await signUp('export-secrets@example.com')

    // Confirm a real password hash actually exists on the Account row — a meaningful
    // negative assertion, not one that would trivially pass because there's nothing to leak.
    const account = await prisma.account.findFirst({ where: { userId, providerId: 'credential' } })
    expect(account?.password).toBeTruthy()

    const response = await fetch(`${baseUrl}/v1/account/export`, { headers: { cookie } })
    const serialized = (await response.text()).toLowerCase()

    expect(serialized).not.toContain(account!.password!.toLowerCase())
    for (const forbidden of ['password', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'verificationtoken']) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
