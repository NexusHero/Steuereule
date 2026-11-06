// Fast, no-DB unit tier (ADR-0004): BelegService against FakeBelegRepository +
// FakeAuditRepository. Mirrors cockpit.service.test.ts. The full real-Postgres proof
// (ciphertext at rest, audit atomicity, cross-user isolation, the real derived-Zuordnung
// through Prisma) lives in beleg.integration.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ReceiptService } from '../src/beleg/beleg.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeReceiptRepository } from './fakes/fake-beleg.repository.js'

const USER_ID = 'user-1'

describe('BelegService', () => {
  let repository: FakeReceiptRepository
  let auditRepository: FakeAuditRepository
  let service: ReceiptService

  beforeEach(() => {
    repository = new FakeReceiptRepository()
    auditRepository = new FakeAuditRepository()
    service = new ReceiptService(repository, new AuditService(auditRepository))
  })

  describe('create — lands UNBOUND (ADR-007)', () => {
    it('a Beleg with no dates creates ungebunden', async () => {
      const receipt = await service.create(USER_ID, { fileName: 'quittung.pdf' })
      expect(receipt.assignment).toEqual({ kind: 'ungebunden' })
      expect(receipt.fileName).toBe('quittung.pdf')
      expect(receipt.belegdatum).toBeNull()
    })

    it('a Beleg with a payment date creates vorgeschlagen, preferring the payment year (§ 11 Zufluss)', async () => {
      const receipt = await service.create(USER_ID, {
        fileName: 'quittung.pdf',
        belegdatum: '2025-12-20',
        zahlungsdatum: '2026-01-15',
      })
      expect(receipt.assignment).toEqual({ kind: 'vorgeschlagen', taxYear: 2026, provenance: 'zahlungsdatum' })
    })

    it('a CH document type (ADR-029) is carried through and read back on the response', async () => {
      const receipt = await service.create(USER_ID, { fileName: 'lohnausweis.pdf', kind: 'Lohnausweis' })
      expect(receipt.kind).toBe('Lohnausweis')
      expect(receipt.assignment).toEqual({ kind: 'ungebunden' })
    })

    it('an omitted art is read back as null (the generic pre-CH receipt)', async () => {
      const receipt = await service.create(USER_ID, { fileName: 'quittung.pdf' })
      expect(receipt.kind).toBeNull()
    })
  })

  describe('list — the inbox, scoped to userId', () => {
    it('returns an empty inbox without appending a READ audit entry', async () => {
      const list = await service.list(USER_ID)
      expect(list).toEqual([])
      expect(auditRepository.all()).toEqual([])
    })

    it('returns the caller’s Belege and appends one READ entry', async () => {
      await service.create(USER_ID, { fileName: 'a.pdf' })
      await service.create(USER_ID, { fileName: 'b.pdf' })

      const list = await service.list(USER_ID)

      expect(list).toHaveLength(2)
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'beleg' }])
    })

    it('never leaks another user’s Belege', async () => {
      await service.create('someone-else', { fileName: 'theirs.pdf' })
      const list = await service.list(USER_ID)
      expect(list).toEqual([])
    })
  })

  describe('setZuordnung — the tap, with a derived conflict (ADR-008)', () => {
    it('confirms the suggested year → zugeordnet', async () => {
      const created = await service.create(USER_ID, { fileName: 'a.pdf', zahlungsdatum: '2026-03-01' })
      const result = await service.setAssignment(USER_ID, created.id, { taxYear: 2026 })
      expect(result.assignment).toEqual({ kind: 'zugeordnet', taxYear: 2026 })
    })

    it('assigning a year that contradicts the dates reports konflikt, never a silent overwrite', async () => {
      const created = await service.create(USER_ID, { fileName: 'a.pdf', zahlungsdatum: '2026-01-15' })
      const result = await service.setAssignment(USER_ID, created.id, { taxYear: 2025 })
      expect(result.assignment).toEqual({
        kind: 'konflikt',
        taxYear: 2025,
        proposalYear: 2026,
        provenance: 'zahlungsdatum',
      })
    })

    it('dismissing a contradicting suggestion (vorschlagVerworfen) resolves the conflict to zugeordnet (ADR-008 "bei meinem Jahr bleiben")', async () => {
      const created = await service.create(USER_ID, { fileName: 'a.pdf', zahlungsdatum: '2026-01-15' })
      const conflict = await service.setAssignment(USER_ID, created.id, { taxYear: 2025 })
      expect(conflict.assignment).toMatchObject({ kind: 'konflikt', taxYear: 2025 })

      const resolved = await service.setAssignment(USER_ID, created.id, { taxYear: 2025, proposalDismissed: true })
      expect(resolved.assignment).toEqual({ kind: 'zugeordnet', taxYear: 2025 })
    })

    it('a foreign or missing id throws NotFound, never leaks existence', async () => {
      await expect(service.setAssignment(USER_ID, 'not-mine', { taxYear: 2026 })).rejects.toThrow(/does not exist/)
    })

    it('a foreign id under the caller’s userId is still not found', async () => {
      const created = await service.create('someone-else', { fileName: 'theirs.pdf' })
      await expect(service.setAssignment(USER_ID, created.id, { taxYear: 2026 })).rejects.toThrow(/does not exist/)
    })
  })
})
