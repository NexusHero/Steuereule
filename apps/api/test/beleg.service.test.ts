// Fast, no-DB unit tier (ADR-0004): BelegService against FakeBelegRepository +
// FakeAuditRepository. Mirrors cockpit.service.test.ts. The full real-Postgres proof
// (ciphertext at rest, audit atomicity, cross-user isolation, the real derived-Zuordnung
// through Prisma) lives in beleg.integration.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { BelegService } from '../src/beleg/beleg.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBelegRepository } from './fakes/fake-beleg.repository.js'

const USER_ID = 'user-1'

describe('BelegService', () => {
  let repository: FakeBelegRepository
  let auditRepository: FakeAuditRepository
  let service: BelegService

  beforeEach(() => {
    repository = new FakeBelegRepository()
    auditRepository = new FakeAuditRepository()
    service = new BelegService(repository, new AuditService(auditRepository))
  })

  describe('create — lands UNBOUND (ADR-007)', () => {
    it('a Beleg with no dates creates ungebunden', async () => {
      const beleg = await service.create(USER_ID, { dateiname: 'quittung.pdf' })
      expect(beleg.zuordnung).toEqual({ kind: 'ungebunden' })
      expect(beleg.dateiname).toBe('quittung.pdf')
      expect(beleg.belegdatum).toBeNull()
    })

    it('a Beleg with a payment date creates vorgeschlagen, preferring the payment year (§ 11 Zufluss)', async () => {
      const beleg = await service.create(USER_ID, {
        dateiname: 'quittung.pdf',
        belegdatum: '2025-12-20',
        zahlungsdatum: '2026-01-15',
      })
      expect(beleg.zuordnung).toEqual({ kind: 'vorgeschlagen', steuerjahr: 2026, herkunft: 'zahlungsdatum' })
    })
  })

  describe('list — the inbox, scoped to userId', () => {
    it('returns an empty inbox without appending a READ audit entry', async () => {
      const list = await service.list(USER_ID)
      expect(list).toEqual([])
      expect(auditRepository.all()).toEqual([])
    })

    it('returns the caller’s Belege and appends one READ entry', async () => {
      await service.create(USER_ID, { dateiname: 'a.pdf' })
      await service.create(USER_ID, { dateiname: 'b.pdf' })

      const list = await service.list(USER_ID)

      expect(list).toHaveLength(2)
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'beleg' }])
    })

    it('never leaks another user’s Belege', async () => {
      await service.create('someone-else', { dateiname: 'theirs.pdf' })
      const list = await service.list(USER_ID)
      expect(list).toEqual([])
    })
  })

  describe('setZuordnung — the tap, with a derived conflict (ADR-008)', () => {
    it('confirms the suggested year → zugeordnet', async () => {
      const created = await service.create(USER_ID, { dateiname: 'a.pdf', zahlungsdatum: '2026-03-01' })
      const result = await service.setZuordnung(USER_ID, created.id, { steuerjahr: 2026 })
      expect(result.zuordnung).toEqual({ kind: 'zugeordnet', steuerjahr: 2026 })
    })

    it('assigning a year that contradicts the dates reports konflikt, never a silent overwrite', async () => {
      const created = await service.create(USER_ID, { dateiname: 'a.pdf', zahlungsdatum: '2026-01-15' })
      const result = await service.setZuordnung(USER_ID, created.id, { steuerjahr: 2025 })
      expect(result.zuordnung).toEqual({
        kind: 'konflikt',
        steuerjahr: 2025,
        vorschlagsJahr: 2026,
        herkunft: 'zahlungsdatum',
      })
    })

    it('a foreign or missing id throws NotFound, never leaks existence', async () => {
      await expect(service.setZuordnung(USER_ID, 'not-mine', { steuerjahr: 2026 })).rejects.toThrow(/does not exist/)
    })

    it('a foreign id under the caller’s userId is still not found', async () => {
      const created = await service.create('someone-else', { dateiname: 'theirs.pdf' })
      await expect(service.setZuordnung(USER_ID, created.id, { steuerjahr: 2026 })).rejects.toThrow(/does not exist/)
    })
  })
})
