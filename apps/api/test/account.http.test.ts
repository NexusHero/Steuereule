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
    const built = await buildTestApp({ sessionsByToken: { 'tok-a': 'account-a', 'tok-b': 'account-b' } })
    app = built.app
    accountIdentityRepository = built.accountIdentityRepository
    pdfRenderer = built.pdfRenderer
    auditRepository = built.auditRepository
  })

  afterEach(async () => {
    await app.close()
  })

  /** A signed-in account: the export is the account's, and only a session of it passes the step-up. */
  const signedIn = (token: 'tok-a' | 'tok-b') => ({ cookie: `better-auth.session_token=${token}`, userId: token === 'tok-a' ? 'account-a' : 'account-b' })

  /** A guest-session cookie and the id the guard signed into it. */
  async function mintGuest(): Promise<{ cookie: string; userId: string }> {
    const { verifyGuestSession, resolveGuestSessionSecret } = await import('../src/auth/guest-session.js')
    const bootstrapResponse = await app.inject({ method: 'GET', url: '/v1/profile' })
    const cookie = extractSessionCookie(bootstrapResponse.headers['set-cookie'])!
    const rawValue = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    const userId = verifyGuestSession(rawValue, resolveGuestSessionSecret())!
    return { cookie, userId }
  }

  it('a guest gets 404 even when an account record exists under its id: without a session nothing is exported', async () => {
    const { cookie, userId } = await mintGuest()
    accountIdentityRepository.seed(userId, ACCOUNT_IDENTITY)
    const response = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie } })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain(ACCOUNT_IDENTITY.email)
    expect(auditRepository.all()).toHaveLength(0)
  })

  it('returns 404 when the caller has no better-auth account yet (a guest that never signed up), and appends no audit entry', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/account/export' })
    expect(response.statusCode).toBe(404)
    expect(auditRepository.all()).toHaveLength(0)
  })

  it('format=json (default): returns the assembled export document with a JSON Content-Disposition attachment', async () => {
    const { cookie, userId } = signedIn('tok-a')
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
    const { cookie, userId } = signedIn('tok-a')
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
    const { cookie: cookieA, userId: userIdA } = signedIn('tok-a')
    accountIdentityRepository.seed(userIdA, ACCOUNT_IDENTITY)

    // A second, independent account session.
    const { cookie: cookieB, userId: userIdB } = signedIn('tok-b')
    expect(userIdB).not.toBe(userIdA)
    accountIdentityRepository.seed(userIdB, { ...ACCOUNT_IDENTITY, email: 'jonas@example.com', name: 'Jonas' })

    const responseA = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie: cookieA } })
    const responseB = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie: cookieB } })

    expect(responseA.json().account.email).toBe(ACCOUNT_IDENTITY.email)
    expect(responseB.json().account.email).toBe('jonas@example.com')
  })

  it('never includes a secret field (password hash, session/verification token) in the JSON response body', async () => {
    const { cookie, userId } = signedIn('tok-a')
    accountIdentityRepository.seed(userId, ACCOUNT_IDENTITY)

    const response = await app.inject({ method: 'GET', url: '/v1/account/export', headers: { cookie } })

    expect(response.statusCode).toBe(200)
    const serialized = JSON.stringify(response.json()).toLowerCase()
    for (const forbidden of ['password', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'verificationtoken']) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
