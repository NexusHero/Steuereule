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

    const erased = new Set(taxDataTables(new Proxy({}, { get: (_t, key) => String(key) }) as never).map(String))
    expect([...read].sort()).toEqual([...erased].sort())
  })

  it('orders by tax year with yearless Belege last, then by area', async () => {
    const rows: Record<string, unknown[]> = {
      beleg: [{ id: 'b', userId: 'u', steuerjahr: null, dateiname: 'quittung.pdf' }],
      kapital: [{ id: 'k', userId: 'u', steuerjahr: 2025, kapitalertraege: '1200' }],
      lstb: [{ id: 'l', userId: 'u', steuerjahr: 2024, bruttoarbeitslohn: '42000' }],
    }
    const prisma = new Proxy({}, { get: (_t, model) => ({ findMany: async () => rows[String(model)] ?? [] }) })
    const entries = await new PrismaTaxDataExportRepository(prisma as never).findAllForUser('u')
    expect(entries.map((entry) => [entry.bereich, entry.steuerjahr])).toEqual([
      ['Lohnsteuerbescheinigung', 2024],
      ['Kapitalerträge', 2025],
      ['Beleg', null],
    ])
  })
})

describe('toExportEntry', () => {
  it('drops technical keys, keeps the person’s figures, and serialises dates', () => {
    const entry = toExportEntry('Kapitalerträge', {
      id: 'row-1',
      userId: 'user-1',
      steuerjahr: 2025,
      kapitalertraege: '1200',
      updatedAt: new Date('2026-02-01T09:30:00.000Z'),
    })
    expect(entry).toEqual({
      bereich: 'Kapitalerträge',
      steuerjahr: 2025,
      felder: { kapitalertraege: '1200', updatedAt: '2026-02-01T09:30:00.000Z' },
    })
  })
})
