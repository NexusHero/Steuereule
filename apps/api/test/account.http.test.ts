// Full-stack (guard + ValidationPipe + controller) tests against fake repositories and
// a fake PdfRenderer, driven over real HTTP via light-my-request — no live Postgres/
// Chromium required (ADR-0004). Mirrors profile.http.test.ts's shape. Complements
// account-export.service.test.ts (pure assembly logic) and
// account-export.integration.test.ts (real Postgres) — this tier proves the wiring:
// the guard-derived userId genuinely drives the response, 404 on no-account, both
// `?format=` branches, and that a client can never smuggle another user's id in.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, extractSessionCookie } from './support/build-test-app.js'
import type { FakeAccountIdentityRepository } from './fakes/fake-account-identity.repository.js'
import type { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import type { FakePdfRenderer } from './fakes/fake-pdf-renderer.js'

process.env.GUEST_SESSION_SECRET = 'account-http-test-secret'

const ACCOUNT_IDENTITY = {
  email: 'anna@example.com',
  name: 'Anna Beispiel',
  emailVerified: true,
  createdAt: new Date('2026-01-15T09:30:00.000Z'),
  authProviders: ['credential'],
}

describe('GET /v1/account/export', () => {
  let app: NestFastifyApplication
  let accountIdentityRepository: FakeAccountIdentityRepository
  let pdfRenderer: FakePdfRenderer
  let auditRepository: FakeAuditRepository

  beforeEach(async () => {
    const built = await buildTestApp()
    app = built.app
    accountIdentityRepository = built.accountIdentityRepository
    pdfRenderer = built.pdfRenderer
    auditRepository = built.auditRepository
  })

  afterEach(async () => {
    await app.close()
  })

  /** Mints a fresh guest-session cookie (via an unrelated GET) and recovers the
   *  trusted userId the guard signed into it, mirroring profile.integration.test.ts's
   *  userIdFromCookie helper — the only legitimate way to learn "whose session is
   *  this", since the cookie value itself is HMAC-signed, not a plain userId. */
  async function mintCookieAndUserId(): Promise<{ cookie: string; userId: string }> {
    const { verifyGuestSession, resolveGuestSessionSecret } = await import('../src/auth/guest-session.js')
    const bootstrapResponse = await app.inject({ method: 'GET', url: '/v1/profile' })
    const cookie = extractSessionCookie(bootstrapResponse.headers['set-cookie'])!
    const rawValue = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    const userId = verifyGuestSession(rawValue, resolveGuestSessionSecret())!
    return { cookie, userId }
  }

  it('returns 404 when the caller has no better-auth account yet (a guest that never signed up), and appends no audit entry', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/account/export' })
    expect(response.statusCode).toBe(404)
    expect(auditRepository.all()).toHaveLength(0)
  })

  it('format=json (default): returns the assembled export document with a JSON Content-Disposition attachment', async () => {
    const { cookie, userId } = await mintCookieAndUserId()
    accountIdentityRepository.seed(userId, ACCOUNT_IDENTITY)

    const response = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie } })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="steuereule-export-\d{4}-\d{2}-\d{2}\.json"$/)
    const body = response.json()
    expect(body.schemaVersion).toBe('1.0')
    expect(body.account.email).toBe(ACCOUNT_IDENTITY.email)
    expect(body.profile).toBeNull()
    expect(body.taxData).toEqual([])
    expect(body.accessLog).toEqual([])

    // ADR-0013 §4/§6: exactly one READ/export audit entry, appended for this call.
    const rows = auditRepository.all().filter((row) => row.userId === userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId, action: 'READ', resource: 'export' })
  })

  it('format=pdf: returns application/pdf bytes from the PdfRenderer seam with a PDF Content-Disposition attachment', async () => {
    const { cookie, userId } = await mintCookieAndUserId()
    accountIdentityRepository.seed(userId, ACCOUNT_IDENTITY)

    const response = await app.inject({
      method: 'GET',
      url: '/v1/account/export?format=pdf',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/pdf/)
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="steuereule-export-\d{4}-\d{2}-\d{2}\.pdf"$/)
    expect(pdfRenderer.lastHtml).toContain(ACCOUNT_IDENTITY.email)

    // Same one-audit-row-per-export contract as the JSON branch (ADR-0013 §4/§6).
    const rows = auditRepository.all().filter((row) => row.userId === userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId, action: 'READ', resource: 'export' })
  })

  it('rejects an unknown ?format= value with 400, never silently falling back to json', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/account/export?format=csv' })
    expect(response.statusCode).toBe(400)
  })

  it('trust boundary: an unknown query param (e.g. a smuggled userId) is rejected with 400, never silently accepted', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/account/export?userId=attacker-chosen-user-id' })
    expect(response.statusCode).toBe(400)
  })

  it('trust boundary: two different sessions never see each other’s export — strict per-userId scoping', async () => {
    const { cookie: cookieA, userId: userIdA } = await mintCookieAndUserId()
    accountIdentityRepository.seed(userIdA, ACCOUNT_IDENTITY)

    // A second, independent session — a fresh request with no cookie is a brand-new
    // guest per the guard, exactly as profile.http.test.ts's isolation test relies on.
    const { cookie: cookieB, userId: userIdB } = await mintCookieAndUserId()
    expect(userIdB).not.toBe(userIdA)
    accountIdentityRepository.seed(userIdB, { ...ACCOUNT_IDENTITY, email: 'jonas@example.com', name: 'Jonas' })

    const responseA = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie: cookieA } })
    const responseB = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie: cookieB } })

    expect(responseA.json().account.email).toBe(ACCOUNT_IDENTITY.email)
    expect(responseB.json().account.email).toBe('jonas@example.com')
  })

  it('never includes a secret field (password hash, session/verification token) in the JSON response body', async () => {
    const { cookie, userId } = await mintCookieAndUserId()
    accountIdentityRepository.seed(userId, ACCOUNT_IDENTITY)

    const response = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie } })

    const serialized = JSON.stringify(response.json()).toLowerCase()
    for (const forbidden of ['password', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'verificationtoken']) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
