import { describe, expect, it } from 'vitest'
import { accountFor } from './accounts'
import { anlagespiegel, AssetError, assetRegister, bookValueAtEndOf, depreciationDrafts, disposalDrafts, type FixedAsset } from './assets'
import { euerTotals } from './closing'
import { createLedger, postEntry, type Ledger } from './journal'

// ADR-0101 §15 — Anlagenverzeichnis: book values from yearly depreciation given as input.

const car: FixedAsset = {
  id: 'pkw-1', label: 'Pkw', account: '0320', acquisitionDate: '2023-07-01', acquisitionCost: 3_000_000,
  // 6 years, pro rata 6/12 in the first year: 2.500, then 5.000 a year; sold in 2025 after 6 months (2.500)
  depreciationByYear: { 2023: 250_000, 2024: 500_000, 2025: 250_000 },
  disposal: { date: '2025-06-30', proceedsNet: 2_400_000, vat: 'ust19' },
}
const laptop: FixedAsset = { id: 'nb-1', label: 'Notebook', account: '0490', acquisitionDate: '2025-02-01', acquisitionCost: 150_000, depreciationByYear: { 2025: 150_000 } }

describe('assetRegister', () => {
  it('carries opening value, additions, depreciation and disposals to the closing value', () => {
    const { rows, totals } = assetRegister([car, laptop], 2025)
    expect(rows).toEqual([
      // 30.000 − 2.500 − 5.000 = 22.500 opening; −2.500 depreciation; 20.000 leaves with the sale
      { id: 'pkw-1', label: 'Pkw', account: '0320', acquisitionDate: '2023-07-01', acquisitionCost: 3_000_000, openingBookValue: 2_250_000, additions: 0, depreciation: 250_000, disposals: 2_000_000, closingBookValue: 0 },
      { id: 'nb-1', label: 'Notebook', account: '0490', acquisitionDate: '2025-02-01', acquisitionCost: 150_000, openingBookValue: 0, additions: 150_000, depreciation: 150_000, disposals: 0, closingBookValue: 0 },
    ])
    expect(totals).toMatchObject({ openingBookValue: 2_250_000, additions: 150_000, depreciation: 400_000, disposals: 2_000_000, closingBookValue: 0 })
    // A written-off asset still owned stays listed (at 0); a sold one does not.
    expect(assetRegister([car, laptop], 2026).rows.map((r) => [r.id, r.closingBookValue])).toEqual([['nb-1', 0]])
    expect(assetRegister([car], 2022).rows).toEqual([])
    expect(bookValueAtEndOf(car, 2024)).toBe(2_250_000)
    expect(bookValueAtEndOf(car, 2025)).toBe(0)
    expect(bookValueAtEndOf(laptop, 2024)).toBe(0)
  })

  it('refuses impossible depreciation', () => {
    expect(() => assetRegister([{ ...laptop, depreciationByYear: { 2025: 200_000 } }], 2025)).toThrow(AssetError)
    expect(() => assetRegister([{ ...laptop, depreciationByYear: { 2024: 1 } }], 2025)).toThrow(/vor der Anschaffung/)
    expect(() => assetRegister([{ ...car, depreciationByYear: { 2026: 1 } }], 2025)).toThrow(/nach dem Abgang/)
    expect(() => assetRegister([{ ...laptop, depreciationByYear: { 2025: -1 } }], 2025)).toThrow(AssetError)
    expect(() => assetRegister([{ ...laptop, acquisitionCost: 1.5 }], 2025)).toThrow(AssetError)
  })
})

describe('depreciation and disposal entries', () => {
  it('book AfA on the account of the asset kind, the disposal and the sale, in the EÜR as well', () => {
    let ledger: Ledger = createLedger('SKR03', 'euer')
    const drafts = [...depreciationDrafts('SKR03', [car, laptop], 2025), ...disposalDrafts('SKR03', [car, laptop], 2025, '1200')]
    expect(drafts.map((d) => [d.date, d.documentNumber, d.lines[0]!.account])).toEqual([
      ['2025-06-30', 'AfA-2025-pkw-1', '4832'],
      ['2025-12-31', 'AfA-2025-nb-1', '4830'],
      ['2025-06-30', 'Abgang-pkw-1', '2315'], // proceeds 24.000 above book value 20.000: Buchgewinn
      ['2025-06-30', 'Verkauf-pkw-1', '1200'],
    ])
    for (const d of drafts) ledger = postEntry(ledger, d).ledger
    expect(euerTotals(ledger, 2025).byKey).toEqual({
      ausgaben_afa_beweglich: 400_000,
      ausgaben_restbuchwert_abgang: 2_000_000,
      einnahmen_veraeusserung_anlagevermoegen: 2_400_000,
      einnahmen_umsatzsteuer_vereinnahmt: 456_000, // 19 % of 24.000
    })
  })

  it('uses the loss account below book value, skips a zero book value and a sale without proceeds', () => {
    const scrapped: FixedAsset = { ...car, disposal: { date: '2025-06-30' } }
    const drafts = disposalDrafts('SKR04', [scrapped], 2025, accountFor('SKR04', 'bank').number)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.lines[0]!.account).toBe('6895')
    const writtenOff: FixedAsset = { ...laptop, disposal: { date: '2025-12-31', proceedsNet: 10_000, vat: 'none' } }
    const sale = disposalDrafts('SKR04', [writtenOff], 2025, '1800')
    expect(sale.map((d) => d.documentNumber)).toEqual(['Verkauf-nb-1'])
    expect(sale[0]!.lines[0]!.amount).toBe(10_000)
    expect(disposalDrafts('SKR04', [laptop], 2025, '1800')).toEqual([])
  })

  it('needs an asset account', () => {
    expect(() => depreciationDrafts('SKR03', [{ ...laptop, account: '1200' }], 2025)).toThrow(/kein Anlagekonto/)
    expect(depreciationDrafts('SKR03', [laptop], 2024)).toEqual([])
  })
})

describe('anlagespiegel (Bruttoanlagespiegel, E-Bilanz Mussfeld)', () => {
  const software: FixedAsset = { id: 'sw-1', label: 'Software', account: '0027', acquisitionDate: '2024-01-10', acquisitionCost: 360_000, depreciationByYear: { 2024: 120_000, 2025: 120_000 } }

  it('develops cost, accumulated depreciation and book value per position', () => {
    const { rows, totals } = anlagespiegel('SKR03', [car, laptop, software], 2025)
    expect(rows).toEqual([
      {
        position: 'A.I', element: 'bs.ass.fixAss.intan',
        acquisitionCostOpening: 360_000, additions: 0, disposalsAtCost: 0, acquisitionCostClosing: 360_000,
        depreciationOpening: 120_000, depreciationOfYear: 120_000, depreciationOnDisposals: 0, depreciationClosing: 240_000,
        bookValueOpening: 240_000, bookValueClosing: 120_000,
      },
      {
        // Pkw: cost 30.000 leaves; its depreciation 2.500 + 5.000 + 2.500 = 10.000 leaves with it.
        // Notebook: 1.500 added and written off in the year.
        position: 'A.II', element: 'bs.ass.fixAss.tan',
        acquisitionCostOpening: 3_000_000, additions: 150_000, disposalsAtCost: 3_000_000, acquisitionCostClosing: 150_000,
        depreciationOpening: 750_000, depreciationOfYear: 400_000, depreciationOnDisposals: 1_000_000, depreciationClosing: 150_000,
        bookValueOpening: 2_250_000, bookValueClosing: 0,
      },
    ])
    expect(totals.bookValueClosing).toBe(assetRegister([car, laptop, software], 2025).totals.closingBookValue)
    expect(totals.acquisitionCostClosing - totals.depreciationClosing).toBe(totals.bookValueClosing)
  })

  it('keeps written-off assets still owned at cost, and drops what left before the year', () => {
    const rows2026 = anlagespiegel('SKR04', [{ ...car, account: '0520' }, { ...laptop, account: '0690' }], 2026).rows
    expect(rows2026).toEqual([expect.objectContaining({ position: 'A.II', acquisitionCostOpening: 150_000, depreciationOpening: 150_000, bookValueClosing: 0 })])
    expect(anlagespiegel('SKR03', [], 2025)).toEqual({ rows: [], totals: expect.objectContaining({ bookValueClosing: 0 }) })
    expect(() => anlagespiegel('SKR03', [{ ...laptop, account: '1200' }], 2025)).toThrow(/kein Anlagekonto/)
  })
})
