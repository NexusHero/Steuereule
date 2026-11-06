// Art. 15/20: the export must read every table the Art. 17 erasure deletes — the two
// lists drifting apart is exactly how "taxData: []" survived while data existed.
import { describe, expect, it } from 'vitest'
import { taxDataTables } from '../src/account/delete-account-transaction.js'
import { PrismaTaxDataExportRepository, toExportEntry } from '../src/account/tax-data-export.repository.prisma.js'

describe('PrismaTaxDataExportRepository', () => {
  it('reads exactly the tables the account deletion erases', async () => {
    const read = new Set<string>()
    const prisma = new Proxy(
      {},
      {
        get: (_target, model) => ({
          findMany: async () => {
            read.add(String(model))
            return []
          },
        }),
      },
    )
    await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('user-1')

    const erased = new Set([
      ...taxDataTables(new Proxy({}, { get: (_t, key) => String(key) }) as never).map(String),
      'taxYearLink',
    ])
    expect([...read].sort()).toEqual([...erased].sort())
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
})
