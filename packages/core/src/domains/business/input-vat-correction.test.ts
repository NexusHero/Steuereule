import { describe, expect, it } from 'vitest'
import { inputVatCorrection } from './input-vat-correction'

describe('Vorsteuerberichtigung (§ 15a UStG, §§ 44, 45 UStDV, statutes read)', () => {
  const machine = { inputVatEur: 6_000, firstUse: '2024-01-10', realEstate: false, originalShare: 1 } as const

  it('corrects a fifth a year by months when the deductible share changes', () => {
    const rows = inputVatCorrection({ ...machine, shareByYear: { 2025: 0.5 } })
    // 6.000 / 60 months = 100 € a month; 2025: 12 × 100 × (0,5 − 1) = −600 €.
    expect(rows.find((r) => r.year === 2025)).toEqual({ year: 2025, months: 12, correctionEur: -600, inPrepayment: false })
    expect(rows.find((r) => r.year === 2024)!.correctionEur).toBe(0)
    expect(rows.map((r) => r.months)).toEqual([12, 12, 12, 12, 12])
  })

  it('starts with the next month after a first use from the 16th (§ 45 UStDV)', () => {
    const rows = inputVatCorrection({ ...machine, firstUse: '2024-03-16', shareByYear: {} })
    expect(rows[0]).toMatchObject({ year: 2024, months: 9 })
    expect(rows.at(-1)).toMatchObject({ year: 2029, months: 3 })
  })

  it('waives up to 1.000 € of input VAT, and a change below 10 points unless the year exceeds 1.000 € (§ 44 Abs. 1, 2)', () => {
    expect(inputVatCorrection({ ...machine, inputVatEur: 1_000, shareByYear: { 2025: 0 } })).toEqual([])
    expect(inputVatCorrection({ ...machine, shareByYear: { 2025: 0.95 } }).find((r) => r.year === 2025)!.correctionEur).toBe(0)
    expect(inputVatCorrection({ ...machine, inputVatEur: 200_000, shareByYear: { 2025: 0.95 } }).find((r) => r.year === 2025)!.correctionEur).toBe(-2_000)
  })

  it('a tax-free sale within the period corrects the rest of it at once, in the Voranmeldung (Abs. 8, 9; § 44 Abs. 3)', () => {
    const rows = inputVatCorrection({ ...machine, shareByYear: {}, disposal: { date: '2026-06-20', share: 0 } })
    // July 2026 to December 2028: 30 months × 100 € to pay back; 2026 holds 6 of them.
    expect(rows.find((r) => r.year === 2026)).toMatchObject({ correctionEur: -600, inPrepayment: true })
    expect(rows.filter((r) => r.year > 2026).reduce((s, r) => s + r.correctionEur, 0)).toBe(-2_400)
  })

  it('takes ten years for a building, and a move from the Kleinunternehmer rule counts as a change', () => {
    const rows = inputVatCorrection({ inputVatEur: 24_000, firstUse: '2024-01-01', realEstate: true, originalShare: 0, shareByYear: { 2025: 1, 2026: 1 } })
    expect(rows).toHaveLength(10)
    expect(rows.find((r) => r.year === 2025)!.correctionEur).toBe(2_400)
  })
})
