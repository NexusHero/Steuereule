// Pure-ish unit tests for AccountExportService (REQ-011/ADR-0013 §4): the assembly
// logic against in-memory fakes, isolated from HTTP/Nest wiring (that's
// account.http.test.ts) and from real Postgres (that's account-export.integration.test.ts).
import { describe, expect, it } from 'vitest'
import { AccountExportService } from '../src/account/account-export.service.js'
import { AuditService } from '../src/audit/audit.service.js'
import { FakeAccountIdentityRepository } from './fakes/fake-account-identity.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakePdfRenderer } from './fakes/fake-pdf-renderer.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'

function buildService() {
  const profileRepository = new FakeProfileRepository()
  const accountIdentityRepository = new FakeAccountIdentityRepository()
  const auditRepository = new FakeAuditRepository()
  const auditService = new AuditService(auditRepository)
  const pdfRenderer = new FakePdfRenderer()
  const service = new AccountExportService(profileRepository, accountIdentityRepository, auditService, pdfRenderer)
  return { service, profileRepository, accountIdentityRepository, auditRepository, pdfRenderer }
}

const ACCOUNT_IDENTITY = {
  email: 'anna@example.com',
  name: 'Anna Beispiel',
  emailVerified: true,
  createdAt: new Date('2026-01-15T09:30:00.000Z'),
  authProviders: ['credential'],
}

const PROFILE = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
  createdAt: new Date('2026-01-16T10:00:00.000Z'),
  updatedAt: new Date('2026-01-17T11:00:00.000Z'),
}

describe('AccountExportService.assemble', () => {
  it('returns null when the caller has no better-auth account yet (a guest that never signed up)', async () => {
    const { service } = buildService()
    await expect(service.assemble('some-guest-user-id')).resolves.toBeNull()
  })

  it('assembles the full document — account + profile + empty taxData + own access log — from one data path', async () => {
    const { service, accountIdentityRepository, profileRepository, auditRepository } = buildService()
    accountIdentityRepository.seed('user-1', ACCOUNT_IDENTITY)
    await profileRepository.upsert('user-1', PROFILE)
    await auditRepository.append({ userId: 'user-1', action: 'WRITE', resource: 'profile' })
    await auditRepository.append({ userId: 'user-1', action: 'READ', resource: 'profile' })

    const document = await service.assemble('user-1')

    expect(document).not.toBeNull()
    expect(document!.schemaVersion).toBe('1.0')
    expect(typeof document!.exportedAt).toBe('string')
    expect(document!.account).toEqual({
      email: ACCOUNT_IDENTITY.email,
      name: ACCOUNT_IDENTITY.name,
      emailVerified: ACCOUNT_IDENTITY.emailVerified,
      createdAt: ACCOUNT_IDENTITY.createdAt.toISOString(),
      authProviders: ACCOUNT_IDENTITY.authProviders,
    })
    // FakeProfileRepository mirrors PrismaProfileRepository's real ownership of
    // createdAt/updatedAt (stamped by the store on upsert, never by the caller) — so
    // only their presence/shape is asserted here, not the fixture's input values.
    expect(document!.profile).toEqual({
      firstName: PROFILE.firstName,
      lastName: PROFILE.lastName,
      steuerId: PROFILE.steuerId,
      steuernummer: PROFILE.steuernummer,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    // Honest empty set until a tax-year model exists (ADR-0013 §4).
    expect(document!.taxData).toEqual([])
    expect(document!.accessLog).toEqual([
      { action: 'WRITE', resource: 'profile', createdAt: expect.any(String) },
      { action: 'READ', resource: 'profile', createdAt: expect.any(String) },
    ])
  })

  it('returns profile: null when the account holder has never saved a Profile — an honest null, not a fabricated shape', async () => {
    const { service, accountIdentityRepository } = buildService()
    accountIdentityRepository.seed('user-no-profile', ACCOUNT_IDENTITY)

    const document = await service.assemble('user-no-profile')

    expect(document!.profile).toBeNull()
  })

  it('scopes strictly per userId: user B never sees user A’s profile or access log', async () => {
    const { service, accountIdentityRepository, profileRepository, auditRepository } = buildService()
    accountIdentityRepository.seed('user-a', ACCOUNT_IDENTITY)
    accountIdentityRepository.seed('user-b', { ...ACCOUNT_IDENTITY, email: 'jonas@example.com', name: 'Jonas' })
    await profileRepository.upsert('user-a', PROFILE)
    await auditRepository.append({ userId: 'user-a', action: 'READ', resource: 'profile' })

    const documentB = await service.assemble('user-b')

    expect(documentB!.profile).toBeNull()
    expect(documentB!.accessLog).toEqual([])
    expect(documentB!.account.email).toBe('jonas@example.com')
  })

  it('never includes a secret field anywhere in the assembled document (no password hash, no session/verification token)', async () => {
    const { service, accountIdentityRepository, profileRepository } = buildService()
    accountIdentityRepository.seed('user-1', ACCOUNT_IDENTITY)
    await profileRepository.upsert('user-1', PROFILE)

    const document = await service.assemble('user-1')

    const serialized = JSON.stringify(document).toLowerCase()
    for (const forbidden of ['password', 'passwordhash', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'verificationtoken', 'secret']) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe('AccountExportService.renderPdf', () => {
  it('delegates to the injected PdfRenderer seam with HTML built from the same assembled document', async () => {
    const { service, accountIdentityRepository, pdfRenderer } = buildService()
    accountIdentityRepository.seed('user-1', ACCOUNT_IDENTITY)
    const document = await service.assemble('user-1')

    const pdf = await service.renderPdf(document!)

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdfRenderer.lastHtml).toBeDefined()
    expect(pdfRenderer.lastHtml).toContain(ACCOUNT_IDENTITY.email)
  })
})

describe('AccountExportService.recordExportRead', () => {
  it('appends exactly one READ audit entry with resource "export" (ADR-0013 §4) — never "profile"', async () => {
    const { service, auditRepository } = buildService()

    await service.recordExportRead('user-1')

    const rows = auditRepository.all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: 'user-1', action: 'READ', resource: 'export' })
  })
})
