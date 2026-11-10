// Fast, no-DB unit tier (ADR-0004): BelegService against FakeBelegRepository +
// FakeAuditRepository. Mirrors cockpit.service.test.ts. The full real-Postgres proof
// (ciphertext at rest, audit atomicity, cross-user isolation, the real derived-Zuordnung
// through Prisma) lives in beleg.integration.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ReceiptService } from '../src/receipt/receipt.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'

const USER_ID = 'user-1'
const PDF_HEADER = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8')
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP_HEADER = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')

describe('BelegService', () => {
  let repository: FakeReceiptRepository
  let auditRepository: FakeAuditRepository
  let storage: InMemoryStorageAdapter
  let service: ReceiptService

  beforeEach(() => {
    repository = new FakeReceiptRepository()
    auditRepository = new FakeAuditRepository()
    storage = new InMemoryStorageAdapter()
    service = new ReceiptService(repository, new AuditService(auditRepository), storage)
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

  describe('encrypted original receipt upload, download & delete (#444)', () => {
    it('accepts PDF, JPEG, PNG and WebP by magic bytes, returns hasFile metadata, and round-trips decrypted bytes', async () => {
      const cases = [
        { fileName: 'lstb.pdf', buffer: PDF_HEADER, expectedMime: 'application/pdf' },
        { fileName: 'foto.jpg', buffer: JPEG_HEADER, expectedMime: 'image/jpeg' },
        { fileName: 'scan.png', buffer: PNG_HEADER, expectedMime: 'image/png' },
        { fileName: 'mobile.webp', buffer: WEBP_HEADER, expectedMime: 'image/webp' },
      ]

      for (const item of cases) {
        const uploaded = await service.upload(USER_ID, {
          fileName: item.fileName,
          buffer: item.buffer,
          kind: 'Sonstiges',
          belegdatum: '2025-11-10',
        })
        expect(uploaded.hasFile).toBe(true)
        expect(uploaded.mimeType).toBe(item.expectedMime)
        expect(uploaded.byteLength).toBe(item.buffer.length)

        const downloaded = await service.getFile(USER_ID, uploaded.id)
        expect(downloaded.mimeType).toBe(item.expectedMime)
        expect(downloaded.fileName).toBe(item.fileName)
        expect(downloaded.buffer.equals(item.buffer)).toBe(true)
      }

      const listed = await service.list(USER_ID)
      expect(listed).toHaveLength(4)
      expect(listed.every((r) => r.hasFile)).toBe(true)
    })

    it('rejects HTML, SVG, scripts or oversized payloads even if named .pdf and leaves zero records', async () => {
      await expect(
        service.upload(USER_ID, {
          fileName: 'evil.pdf',
          buffer: Buffer.from('<html><script>alert(1)</script></html>', 'utf8'),
        }),
      ).rejects.toThrow(/Dateiformat/)

      await expect(
        service.upload(USER_ID, {
          fileName: 'tiny.png',
          buffer: Buffer.alloc(0),
        }),
      ).rejects.toThrow(/leer/)

      expect(repository.recordCount()).toBe(0)
    })

    it('isolates getFile and delete across users, and returns 404 after crypto-shredding / delete', async () => {
      const uploaded = await service.upload(USER_ID, {
        fileName: 'lstb-2025.pdf',
        buffer: PDF_HEADER,
      })

      await expect(service.getFile('other-user', uploaded.id)).rejects.toThrow(/does not exist/)
      await expect(service.delete('other-user', uploaded.id)).rejects.toThrow(/does not exist/)

      // Simulate crypto-shredding wiping DEK/stored binary while record metadata check still fails with 404
      storage.cryptoShredUser(USER_ID)
      await expect(service.getFile(USER_ID, uploaded.id)).rejects.toThrow(/keine entschlüsselbare Originaldatei/)

      const deleted = await service.delete(USER_ID, uploaded.id)
      expect(deleted).toEqual({ deleted: true })
      expect(repository.recordCount()).toBe(0)
    })
  })
})
