// The Belege inbox in pages (keyset cursor) with the counts the screen used to compute over the whole
// list: total, open, per folder and the one-tap proposals. In-memory fakes, no database.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { InvalidInputError } from '../src/common/domain-error.js'
import { ReceiptService } from '../src/receipt/receipt.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'

const USER = 'user-1'
const OTHER = 'user-2'

describe('ReceiptService.listPage', () => {
  let service: ReceiptService

  beforeEach(() => {
    service = new ReceiptService(new FakeReceiptRepository(), new AuditService(new FakeAuditRepository()), new InMemoryStorageAdapter())
  })

  async function upload(fileName: string, extra: { kind?: 'Lohnausweis' | 'Saeule3a' | 'Steuerbescheid' | 'Sonstiges'; zahlungsdatum?: string; userId?: string } = {}) {
    await new Promise((resolve) => setTimeout(resolve, 2))
    return service.create(extra.userId ?? USER, { fileName, ...(extra.kind ? { kind: extra.kind } : {}), ...(extra.zahlungsdatum ? { zahlungsdatum: extra.zahlungsdatum } : {}) })
  }

  it('returns newest first, cuts at the limit and hands out a cursor for the rest', async () => {
    for (const n of [1, 2, 3, 4, 5]) await upload(`b${n}.pdf`)

    const first = await service.listPage(USER, { limit: 2 })
    expect(first.items.map((r) => r.fileName)).toEqual(['b5.pdf', 'b4.pdf'])
    expect(first.nextCursor).not.toBeNull()

    const second = await service.listPage(USER, { limit: 2, cursor: first.nextCursor! })
    expect(second.items.map((r) => r.fileName)).toEqual(['b3.pdf', 'b2.pdf'])

    const last = await service.listPage(USER, { limit: 2, cursor: second.nextCursor! })
    expect(last.items.map((r) => r.fileName)).toEqual(['b1.pdf'])
    expect(last.nextCursor).toBeNull()
  })

  it('counts over every Beleg of the user, not just the page', async () => {
    await upload('a.pdf', { kind: 'Lohnausweis' })
    await upload('b.pdf', { kind: 'Saeule3a' })
    await upload('c.pdf', { kind: 'Steuerbescheid' })
    await upload('d.pdf')
    await upload('e.pdf', { kind: 'Sonstiges' })
    await upload('fremd.pdf', { kind: 'Lohnausweis', userId: OTHER })

    const page = await service.listPage(USER, { limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.counts).toMatchObject({ total: 5, open: 5, folders: { einkuenfte: 1, vorsorge: 1, bescheide: 1, weitere: 2 } })
  })

  it('filters by folder and still counts every folder', async () => {
    await upload('a.pdf', { kind: 'Lohnausweis' })
    await upload('b.pdf', { kind: 'Saeule3a' })
    await upload('c.pdf')

    const page = await service.listPage(USER, { limit: 10, folder: 'weitere' })
    expect(page.items.map((r) => r.fileName)).toEqual(['c.pdf'])
    expect(page.counts.total).toBe(3)
  })

  it('lists the proposals that only wait for a yes, over all pages', async () => {
    const a = await upload('a.pdf', { zahlungsdatum: '2025-03-01' })
    await upload('b.pdf')
    const c = await upload('c.pdf', { zahlungsdatum: '2024-05-01' })

    const page = await service.listPage(USER, { limit: 1 })
    expect(page.counts.proposals).toEqual(expect.arrayContaining([{ id: a.id, taxYear: 2025 }, { id: c.id, taxYear: 2024 }]))
    expect(page.counts.proposals).toHaveLength(2)
  })

  it('counts the Belege that still have no confirmed year', async () => {
    const a = await upload('a.pdf', { zahlungsdatum: '2025-03-01' })
    await upload('b.pdf')
    await upload('c.pdf')
    await service.setAssignment(USER, a.id, { taxYear: 2025, proposalDismissed: false })

    const page = await service.listPage(USER, { limit: 1 })
    expect(page.counts.unassigned).toBe(2)
  })

  it('answers an empty inbox with zero counts', async () => {
    const page = await service.listPage(USER, { limit: 10 })
    expect(page).toEqual({ items: [], nextCursor: null, counts: { total: 0, open: 0, unassigned: 0, folders: { einkuenfte: 0, vorsorge: 0, bescheide: 0, weitere: 0 }, proposals: [] } })
  })

  it('refuses a cursor it did not hand out', async () => {
    await expect(service.listPage(USER, { limit: 2, cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(InvalidInputError)
  })
})
