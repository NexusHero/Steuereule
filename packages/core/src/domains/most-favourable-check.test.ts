import { describe, expect, it } from 'vitest'
import { mostFavourableCheck, mostFavourableCheckOnEstimate } from './most-favourable-check'
import { incomeTax, progressionClauseTax, soliExemptionLimits, solidaritaetszuschlag, solidaritaetszuschlagInCents, splittingTariff } from '../math/tarif'

// Ticket 10.5 — die Günstigerprüfung (§ 32d Abs. 6 EStG), bounded comparison nach dem
// ADR-0034-Muster. The expected amounts below are hand-computed from the cited statutory
// rules (§ 32d Abs. 1/6, § 20 Abs. 9, § 32a, § 4 SolZG, § 51a EStG) with the 2026
// coefficients of tarif.ts — the tests pin the contract, not a magic number.

describe('guenstigerpruefung — the two amounts (Ebene 2, exakt gegeben die Eingaben)', () => {
  it('computes the Abgeltungsteuer: 25 % on Kapitalerträge minus Sparerpauschbetrag, plus Soli', () => {
    // 20.000 − 1.000 = 19.000 → 4.750 Abgeltungsteuer; Soli 261,25 € (5,5 % ohne Freigrenze: § 3 Abs. 3
    // Satz 2 SolZG nimmt die Steuer nach § 32d Abs. 1 von der Freigrenze aus) → 5.011,25 €.
    const result = mostFavourableCheck({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      year: 2026,
      assessmentType: 'einzel',
      progressionClause: { kind: 'keine' },
    })
    expect(result.flatRateTax).toBe(5011.25)
    // Persönlich: auch hier mindert der Sparerpauschbetrag (§ 20 Abs. 9), also 19.000 auf 60.000:
    // (22.044 − 14.233) + Soli-Differenz (201 − 0, Milderungszone über der Freigrenze 20.350)
    // = 7.811 + 201 = 8.012. Gegengerechnet mit dem Rechner des steuerberater-Skills.
    expect(result.personal).toBe(8012)
    expect(result.delta).toBe(3000.75)
    expect(result.provenance).toEqual({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      saversAllowance: 1000,
      assessmentType: 'einzel',
      components: ['einkommensteuer', 'solidaritaetszuschlag'],
    })
  })

  it('folds Kirchensteuer into both sides, including the § 32d Abs. 1 Satz 4 Ermäßigung', () => {
    // Abgeltung (§ 32d Abs. 1 Satz 4): ESt = 99.000 / 4,09 = 24.205; KiSt 9 % = 2.178;
    // Soli 5,5 % ohne Freigrenze (§ 3 Abs. 3 Satz 2 SolZG) = 1.331,27 → 24.205 + 2.178 + 1.331,27 = 27.714,27.
    const result = mostFavourableCheck({
      kapitalertraege: 100000,
      remainingZvE: 300000,
      year: 2026,
      assessmentType: 'einzel',
      progressionClause: { kind: 'keine' },
      churchTaxFactor: 0.09,
    })
    expect(result.flatRateTax).toBe(27714.27)
    // Persönlich (99.000 nach Sparerpauschbetrag auf 300.000): (160.079 − 115.529) + (8.804 − 6.354)
    // + 9 % von 44.550 = 44.550 + 2.450 + 4.009 = 51.009.
    expect(result.personal).toBe(51009)
    expect(result.delta).toBe(51009 - 27714.27)
    if (result.provenance) {
      expect(result.provenance.components).toEqual(['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'])
    }
  })

  it('computes the Zusammenveranlagung side via the Splitting tariff on the combined basis', () => {
    // Abgeltung: (20.000 − 2.000) × 25 % = 4.500; Soli 0 (unter der Freigrenze 40.700).
    // Persönlich: splitting(78.000) − splitting(60.000) = 13.788 − 8.434 = 5.354 (18.000 nach Sparerpauschbetrag).
    const result = mostFavourableCheck({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      year: 2026,
      assessmentType: 'zusammen',
      progressionClause: { kind: 'keine' },
    })
    expect(result.flatRateTax).toBe(4747.5)
    expect(result.personal).toBe(5354)
    expect(result.delta).toBe(606.5)
    expect(result.provenance.saversAllowance).toBe(2000)
    expect(result.provenance.assessmentType).toBe('zusammen')
  })
})

describe('guenstigerpruefung — the bounded verdict (ADR-0034 Entscheidung 2)', () => {
  const basis = {
    kapitalertraege: 20000,
    remainingZvE: 60000,
    year: 2026,
    assessmentType: 'einzel' as const,
  }

  it('is eindeutig with empfehlung when |delta| exceeds the Progressionsvorbehalt-Schranke', () => {
    const flatRateCheaper = mostFavourableCheck({ ...basis, progressionClause: { kind: 'keine' } })
    expect(flatRateCheaper.statement).toBe('eindeutig')
    if (flatRateCheaper.statement === 'eindeutig') {
      expect(flatRateCheaper.recommendation).toBe('abgeltung') // delta = +3.481
    }

    // Geringverdiener: persönlicher Satz 0 < Abgeltungsteuer 1.000 → persönlich günstiger.
    const personalCheaper = mostFavourableCheck({
      kapitalertraege: 5000,
      remainingZvE: 0,
      year: 2026,
      assessmentType: 'einzel',
      progressionClause: { kind: 'keine' },
    })
    expect(personalCheaper.statement).toBe('eindeutig')
    if (personalCheaper.statement === 'eindeutig') {
      expect(personalCheaper.recommendation).toBe('persoenlich')
    }
  })

  it('is zu-knapp when the delta lies inside the computed Schranke — no verdict', () => {
    // Lohnersatz 20.000 → Schranke ⌈0,45 × 20.000⌉ = 9.000; |delta| = 3.732 ≤ 9.000.
    const result = mostFavourableCheck({
      ...basis,
      progressionClause: { kind: 'lohnersatzleistungen', amount: 20000 },
    })
    expect(result.statement).toBe('zu-knapp')
    if (result.statement === 'zu-knapp') {
      expect(result.uncertainty).toEqual({ kind: 'bestimmt', upperLimit: 9000 })
    }
    // A bare verdict is unrepresentable: zu-knapp has no empfehlung field at all.
    expect('recommendation' in result).toBe(false)
  })

  it('is unbestimmt when the Progressionsvorbehalt is not bounded — no verdict possible', () => {
    const result = mostFavourableCheck({ ...basis, progressionClause: { kind: 'nicht-angegeben' } })
    expect(result.statement).toBe('unbestimmt')
    if (result.statement === 'unbestimmt') {
      expect(result.uncertainty).toEqual({ kind: 'unbestimmt', reason: 'progressionsvorbehalt-nicht-eingegeben' })
    }
    expect('recommendation' in result).toBe(false)
    // The two amounts are still exact — only the verdict is withheld.
    expect(result.flatRateTax).toBe(5011.25)
    expect(result.personal).toBe(8012)
  })
})

describe('guenstigerpruefung — validation (throw, don\'t approximate)', () => {
  const basis = {
    kapitalertraege: 20000,
    remainingZvE: 60000,
    year: 2026,
    assessmentType: 'einzel' as const,
    progressionClause: { kind: 'keine' as const },
  }

  it('throws on negative or non-integer inputs', () => {
    expect(() => mostFavourableCheck({ ...basis, kapitalertraege: -1 })).toThrow(RangeError)
    expect(() => mostFavourableCheck({ ...basis, remainingZvE: -1 })).toThrow(RangeError)
    expect(() => mostFavourableCheck({ ...basis, kapitalertraege: 1.5 })).toThrow(RangeError)
    expect(() => mostFavourableCheck({ ...basis, remainingZvE: 1.5 })).toThrow(RangeError)
  })

  it('throws on an unsupported tax year — never falls back to a neighbour year', () => {
    expect(() => mostFavourableCheck({ ...basis, year: 2021 })).toThrow(RangeError)
  })
})

// The capital mask compares on the figures of the Cockpit estimate (§ 32d Abs. 6 EStG): its taxable
// income without the capital income, its tariff (basic or splitting), its § 32b income. The flat side
// is what the estimate charges for it: 25 % and 5,5 % Soli without the exemption limit (§ 3 Abs. 3 SolZG
// leaves the tax under § 32d out of the Freigrenze test).
describe('mostFavourableCheckOnEstimate — the comparison on the estimate’s own figures', () => {
  const single = { kapitalertraege: 20000, year: 2025, assessmentType: 'einzel' as const, taxableIncome: { from: 50000, to: 50000 }, progressionIncomeEur: 0 }

  it('single: basic tariff, 1.000 € allowance, flat tax with Soli from the first euro', () => {
    const result = mostFavourableCheckOnEstimate(single)
    // 19.000 € × 25 % = 4.750 €, Soli 5,5 % = 261,25 €.
    expect(result.flatRateTax).toBe(5011.25)
    const withCapital = incomeTax(69000, 2025)
    const without = incomeTax(50000, 2025)
    const soliLimit = soliExemptionLimits(2025).single
    expect(result.personal).toBe(withCapital - without + solidaritaetszuschlag(withCapital, soliLimit) - solidaritaetszuschlag(without, soliLimit))
    expect(result.statement).toBe('eindeutig')
    if (result.statement === 'eindeutig') expect(result.recommendation).toBe('abgeltung')
    expect(result.delta).toBe(Math.round((result.personal - result.flatRateTax) * 100) / 100)
    expect(result.provenance).toEqual({ kapitalertraege: 20000, remainingZvE: 50000, remainingZvEFrom: 50000, saversAllowance: 1000, assessmentType: 'einzel', components: ['einkommensteuer', 'solidaritaetszuschlag'] })
  })

  it('joint: splitting tariff and the 2.000 € allowance, Soli in cents as on the notice', () => {
    const result = mostFavourableCheckOnEstimate({ ...single, kapitalertraege: 3000, assessmentType: 'zusammen', taxableIncome: { from: 100000, to: 100000 } })
    // 1.000 € × 25 % = 250 €, Soli 13,75 €.
    expect(result.flatRateTax).toBe(263.75)
    const limit = soliExemptionLimits(2025).joint
    const withCapital = splittingTariff(101000, 0, 2025)
    const without = splittingTariff(100000, 0, 2025)
    expect(result.personal).toBe(withCapital - without + (solidaritaetszuschlagInCents(withCapital, limit) - solidaritaetszuschlagInCents(without, limit)) / 100)
    expect(result.provenance.saversAllowance).toBe(2000)
  })

  it('takes the estimate’s § 32b income into the tariff on both sides', () => {
    const result = mostFavourableCheckOnEstimate({ ...single, progressionIncomeEur: 8000 })
    const tax = (z: number) => progressionClauseTax(z, 8000, 2025)
    const soliLimit = soliExemptionLimits(2025).single
    expect(result.personal).toBe(tax(69000) - tax(50000) + solidaritaetszuschlag(tax(69000), soliLimit) - solidaritaetszuschlag(tax(50000), soliLimit))
    expect(result.uncertainty).toEqual({ kind: 'bestimmt', upperLimit: 0 })
  })

  it('a low income: the tariff wins and the difference is the whole flat tax', () => {
    const result = mostFavourableCheckOnEstimate({ ...single, kapitalertraege: 5000, taxableIncome: { from: 6000, to: 7000 } })
    // 4.000 € on 7.000 € stays under the Grundfreibetrag (12.096 € in 2025): no tariff tax at all.
    expect(result.personal).toBe(0)
    expect(result.flatRateTax).toBe(1055)
    expect(result.delta).toBe(-1055)
    expect(result.statement).toBe('eindeutig')
    if (result.statement === 'eindeutig') expect(result.recommendation).toBe('persoenlich')
  })

  it('a range of the estimate: computed at its upper end, the spread is the margin', () => {
    const result = mostFavourableCheckOnEstimate({ ...single, taxableIncome: { from: 48000, to: 50000 } })
    const low = mostFavourableCheckOnEstimate({ ...single, taxableIncome: { from: 48000, to: 48000 } })
    const high = mostFavourableCheckOnEstimate({ ...single, taxableIncome: { from: 50000, to: 50000 } })
    expect(result.personal).toBe(high.personal)
    expect(result.uncertainty).toEqual({ kind: 'bestimmt', upperLimit: Math.ceil(Math.abs(high.personal - low.personal)) })
    expect(result.provenance.remainingZvE).toBe(50000)
    expect(result.provenance.remainingZvEFrom).toBe(48000)
  })
})
