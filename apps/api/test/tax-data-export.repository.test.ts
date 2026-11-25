// Art. 15/20: the export must read every table the Art. 17 erasure deletes — the two
// lists drifting apart is exactly how "taxData: []" survived while data existed.
import { describe, expect, it } from 'vitest'
import { PERSONAL_DATA_REGISTRY } from '../src/account/personal-data-registry.js'
import { shadowIdOf } from '../src/common/shadow-id.js'
import { PrismaTaxDataExportRepository, toExportEntry } from '../src/account/tax-data-export.repository.prisma.js'

describe('PrismaTaxDataExportRepository', () => {
  it('reads every table the registry exports as rows, over the own id and every Person B shadow id (API-2)', async () => {
    const read = new Map<string, unknown>()
    const prisma = new Proxy(
      {},
      {
        get: (_target, model) => ({
          findMany: async (args: { where: unknown }) => {
            read.set(String(model), args.where)
            return []
          },
        }),
      },
    )
    await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('user-1')

    const exported = PERSONAL_DATA_REGISTRY.filter((entry) => entry.export.kind === 'rows').map((entry) => entry.model.charAt(0).toLowerCase() + entry.model.slice(1))
    for (const model of [...exported, 'taxYearLink', 'partnerLink', 'householdPerson', 'householdMergeCandidate']) expect(read.has(model), model).toBe(true)
    expect(read.has('unlock')).toBe(true)
    const lstbWhere = read.get('lstb') as { userId: { in: string[] } }
    expect(lstbWhere.userId.in).toContain('user-1')
    expect(lstbWhere.userId.in).toContain(shadowIdOf('user-1', 2025))
  })

  it('marks a row kept for Person B under a shadow id', async () => {
    const rows: Record<string, unknown[]> = { lstb: [{ id: 'l', userId: shadowIdOf('u', 2025), taxYear: 2025, bruttoarbeitslohn: '30000' }] }
    const prisma = new Proxy({}, { get: (_t, model) => ({ findMany: async () => rows[String(model)] ?? [] }) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('u')
    expect(entries.map((entry) => entry.area)).toEqual(['Lohnsteuerbescheinigung (Person B)'])
  })

  it('orders by tax year with yearless Belege last, then by area', async () => {
    const rows: Record<string, unknown[]> = {
      receipt: [{ id: 'b', userId: 'u', taxYear: null, dateiname: 'quittung.pdf' }],
      capital: [{ id: 'k', userId: 'u', taxYear: 2025, kapitalertraege: '1200' }],
      lstb: [{ id: 'l', userId: 'u', taxYear: 2024, bruttoarbeitslohn: '42000' }],
    }
    const prisma = new Proxy({}, { get: (_t, model) => ({ findMany: async () => rows[String(model)] ?? [] }) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('u')
    expect(entries.map((entry) => [entry.area, entry.taxYear])).toEqual([
      ['Lohnsteuerbescheinigung', 2024],
      ['Kapitalerträge', 2025],
      ['Beleg', null],
    ])
  })
})

describe('toExportEntry', () => {
  it('drops technical keys, keeps the person’s figures, and serialises dates', () => {
    const entry = toExportEntry('Kapitalerträge', 'Capital', {
      id: 'row-1',
      userId: 'user-1',
      taxYear: 2025,
      kapitalertraege: '1200',
      updatedAt: new Date('2026-02-01T09:30:00.000Z'),
    })
    expect(entry).toEqual({
      area: 'Kapitalerträge',
      taxYear: 2025,
      fields: { kapitalertraege: '1200', updatedAt: '2026-02-01T09:30:00.000Z' },
    })
  })

  it('names each figure by its database column, so the download keeps its German keys', () => {
    const entry = toExportEntry('Kind', 'Child', { id: 'c', userId: 'u', taxYear: 2025, firstName: 'Mia', lastName: 'Beispiel' })
    expect(entry.fields).toEqual({ vorname: 'Mia', nachname: 'Beispiel' })
  })

  it('exports ReceiptFile metadata while stripping binary cipherBytes, iv, authTag, and keyVersion', () => {
    const entry = toExportEntry('Beleg-Datei', 'ReceiptFile', {
      id: 'rf-1',
      receiptId: 'rec-1',
      userId: 'u',
      mimeType: 'application/pdf',
      byteLength: 4096,
      sha256: 'abc123',
      iv: Buffer.from([1, 2, 3]),
      authTag: Buffer.from([4, 5, 6]),
      cipherBytes: Buffer.from([7, 8, 9]),
      keyVersion: 1,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    })
    expect(entry).toEqual({
      area: 'Beleg-Datei',
      taxYear: null,
      fields: {
        mimeType: 'application/pdf',
        dateigroesse: 4096,
        sha256: 'abc123',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
    })
  })
})
