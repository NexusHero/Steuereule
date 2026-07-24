// ExportService unit tests (§3.1 TDD, REQ-011, ADR-0013 §4).
// Exercises: completeness (profile + account + accessLog), secrets exclusion,
// honest empty taxData, PDF vs JSON format branching, audit entry appended,
// null profile (honest empty state).
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ExportService, type ExportFormat } from '../src/export/export.service.js'
import type { ExportData } from '../src/export/export.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeExportRepository } from './fakes/fake-export.repository.js'
import { FakePdfRenderer } from './fakes/fake-pdf-renderer.js'

const NOW = new Date('2026-07-24T10:00:00.000Z')

function fullExportData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    profile: {
      firstName: 'Anna',
      lastName: 'Beispiel',
      steuerId: '02476291358',
      steuernummer: '18181508155',
      createdAt: new Date('2026-01-15T08:00:00.000Z'),
      updatedAt: new Date('2026-06-20T12:00:00.000Z'),
    },
    account: {
      email: 'anna@example.com',
      name: 'Anna Beispiel',
      emailVerified: true,
      createdAt: new Date('2026-01-10T08:00:00.000Z'),
      authProviders: ['credential'],
    },
    accessLog: [
      { action: 'READ', resource: 'profile', createdAt: new Date('2026-03-01T09:00:00.000Z') },
      { action: 'WRITE', resource: 'profile', createdAt: new Date('2026-03-02T14:00:00.000Z') },
    ],
    ...overrides,
  }
}

describe('ExportService', () => {
  let exportRepo: FakeExportRepository
  let auditRepo: FakeAuditRepository
  let pdfRenderer: FakePdfRenderer
  let service: ExportService

  beforeEach(() => {
    exportRepo = new FakeExportRepository()
    auditRepo = new FakeAuditRepository()
    pdfRenderer = new FakePdfRenderer()
    service = new ExportService(exportRepo, new AuditService(auditRepo), pdfRenderer)
  })

  // --- JSON branch (default) ---

  it('JSON export returns the full ADR-0013 §4 schema shape', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')

    expect(result.contentType).toBe('application/json')
    expect(result.filename).toMatch(/^steuereule-export-\d{4}-\d{2}-\d{2}\.json$/)
    const body = result.body as unknown as Record<string, unknown>
    expect(body.schemaVersion).toBe('1.0')
    expect(body.exportedAt).toBeTypeOf('string')
    expect(body.account).toBeDefined()
    expect(body.profile).toBeDefined()
    expect(body.taxData).toBeDefined()
    expect(body.accessLog).toBeDefined()
  })

  it('JSON export includes the complete account identity', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>
    const account = body.account as unknown as Record<string, unknown>

    expect(account.email).toBe('anna@example.com')
    expect(account.name).toBe('Anna Beispiel')
    expect(account.emailVerified).toBe(true)
    expect(account.createdAt).toBe('2026-01-10T08:00:00.000Z')
    expect(account.authProviders).toEqual(['credential'])
  })

  it('JSON export includes the decrypted profile when it exists', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>
    const profile = body.profile as unknown as Record<string, unknown>

    expect(profile.firstName).toBe('Anna')
    expect(profile.lastName).toBe('Beispiel')
    expect(profile.steuerId).toBe('02476291358')
    expect(profile.steuernummer).toBe('18181508155')
    expect(profile.createdAt).toBe('2026-01-15T08:00:00.000Z')
    expect(profile.updatedAt).toBe('2026-06-20T12:00:00.000Z')
  })

  it('JSON export sets profile to null when no profile exists (honest empty state)', async () => {
    exportRepo.seed('user-a', fullExportData({ profile: null }))

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>

    expect(body.profile).toBeNull()
  })

  it('JSON export includes the honest empty taxData array (no tax-year model yet)', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>

    expect(body.taxData).toEqual([])
  })

  it('JSON export includes the subject\'s own access log entries', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>
    const log = body.accessLog as unknown as Record<string, unknown>[]

    expect(log).toHaveLength(2)
    expect(log[0]).toEqual({ action: 'READ', resource: 'profile', createdAt: '2026-03-01T09:00:00.000Z' })
    expect(log[1]).toEqual({ action: 'WRITE', resource: 'profile', createdAt: '2026-03-02T14:00:00.000Z' })
  })

  // --- Secrets exclusion (ADR-0013 §4 quality attribute) ---

  it('JSON export never contains a password hash', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const json = JSON.stringify(result.body)

    expect(json).not.toContain('password')
    expect(json).not.toContain('hash')
  })

  it('JSON export never contains session or verification tokens', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const json = JSON.stringify(result.body)

    expect(json).not.toContain('token')
    expect(json).not.toContain('accessToken')
    expect(json).not.toContain('refreshToken')
  })

  it('JSON export never contains another user\'s data', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'json')
    const json = JSON.stringify(result.body)

    // Only user-a's data should appear — no references to other user IDs
    expect(json).not.toContain('user-b')
    expect(json).not.toContain('jonas')
  })

  // --- PDF branch ---

  it('PDF export delegates to PdfRenderer and returns application/pdf', async () => {
    exportRepo.seed('user-a', fullExportData())

    const result = await service.exportData('user-a', 'pdf')

    expect(result.contentType).toBe('application/pdf')
    expect(result.filename).toMatch(/^steuereule-export-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(Buffer.isBuffer(result.body)).toBe(true)
    expect(pdfRenderer.callCount()).toBe(1)
  })

  it('PDF renderer receives the same assembled data as the JSON branch (single data path)', async () => {
    exportRepo.seed('user-a', fullExportData())

    await service.exportData('user-a', 'json')
    const jsonAuditEntries = auditRepo.all().length

    await service.exportData('user-a', 'pdf')
    const lastCall = pdfRenderer.lastCall()

    // Same data was passed to both renderers
    expect(lastCall).toBeDefined()
    expect(lastCall!.data.account.email).toBe('anna@example.com')
    expect(lastCall!.data.profile?.firstName).toBe('Anna')
  })

  // --- Audit entry (ADR-0013 §4: every export is logged) ---

  it('appends a READ audit entry with resource "export" for JSON export', async () => {
    exportRepo.seed('user-a', fullExportData())

    await service.exportData('user-a', 'json')

    const entries = auditRepo.all()
    const exportEntries = entries.filter((e) => e.resource === 'export')
    expect(exportEntries).toHaveLength(1)
    expect(exportEntries[0]!.action).toBe('READ')
    expect(exportEntries[0]!.userId).toBe('user-a')
  })

  it('appends a READ audit entry with resource "export" for PDF export', async () => {
    exportRepo.seed('user-a', fullExportData())

    await service.exportData('user-a', 'pdf')

    const entries = auditRepo.all()
    const exportEntries = entries.filter((e) => e.resource === 'export')
    expect(exportEntries).toHaveLength(1)
    expect(exportEntries[0]!.action).toBe('READ')
  })

  // --- Auth providers deduplication ---

  it('deduplicates authProviders when multiple Account rows share the same providerId', async () => {
    exportRepo.seed('user-a', fullExportData({
      account: {
        email: 'anna@example.com',
        name: 'Anna Beispiel',
        emailVerified: true,
        createdAt: new Date('2026-01-10T08:00:00.000Z'),
        authProviders: ['credential', 'credential', 'google'],
      },
    }))

    const result = await service.exportData('user-a', 'json')
    const body = result.body as unknown as Record<string, unknown>
    const account = body.account as unknown as Record<string, unknown>

    expect(account.authProviders).toEqual(['credential', 'google'])
  })
})
