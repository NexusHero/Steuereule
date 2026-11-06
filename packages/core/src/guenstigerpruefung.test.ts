import { describe, expect, it } from 'vitest'
import { mostFavourableCheck } from './guenstigerpruefung'

// Ticket 10.5 — die Günstigerprüfung (§ 32d Abs. 6 EStG), bounded comparison nach dem
// ADR-0034-Muster. The expected amounts below are hand-computed from the cited statutory
// rules (§ 32d Abs. 1/6, § 20 Abs. 9, § 32a, § 4 SolZG, § 51a EStG) with the 2026
// coefficients of tarif.ts — the tests pin the contract, not a magic number.

describe('guenstigerpruefung — the two amounts (Ebene 2, exakt gegeben die Eingaben)', () => {
  it('computes the Abgeltungsteuer: 25 % on Kapitalerträge minus Sparerpauschbetrag, plus Soli', () => {
    // 20.000 − 1.000 = 19.000 → 4.750 Abgeltungsteuer; Soli 0 (unter der Freigrenze 20.350).
    const result = mostFavourableCheck({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      year: 2026,
      assessmentType: 'einzel',
      progressionClause: { kind: 'keine' },
    })
    expect(result.flatRateTax).toBe(4750)
    // Persönlich: (22.464 − 14.233) + Soli-Differenz (251 − 0, Milderungszone über der Freigrenze
    // 20.350) = 8.231 + 251 = 8.482.
    expect(result.personal).toBe(8482)
    expect(result.delta).toBe(3732)
    expect(result.provenance).toEqual({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      saversAllowance: 1000,
      assessmentType: 'einzel',
      components: ['einkommensteuer', 'solidaritaetszuschlag'],
    })
  })

  it('folds Kirchensteuer into both sides, including the § 32d Abs. 1 Satz 4 Ermäßigung', () => {
    // Abgeltung: 99.000 × 25 % = 24.750; Soli (Milderungszone) 523; KiSt 2.227, Ermäßigung 25 % = 556
    // → 24.750 − 556 + 2.227 + 523 = 26.944.
    const result = mostFavourableCheck({
      kapitalertraege: 100000,
      remainingZvE: 300000,
      year: 2026,
      assessmentType: 'einzel',
      progressionClause: { kind: 'keine' },
      churchTaxFactor: 0.09,
    })
    expect(result.flatRateTax).toBe(26944)
    // Persönlich: (160.529 − 115.529) + (8.829 − 6.354) + 4.050 = 45.000 + 2.475 + 4.050 = 51.525.
    expect(result.personal).toBe(51525)
    expect(result.delta).toBe(24581)
    if (result.provenance) {
      expect(result.provenance.components).toEqual(['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'])
    }
  })

  it('computes the Zusammenveranlagung side via the Splitting tariff on the combined basis', () => {
    // Abgeltung: (20.000 − 2.000) × 25 % = 4.500; Soli 0 (unter der Freigrenze 40.700).
    // Persönlich: splitting(80.000) − splitting(60.000) = 14.418 − 8.434 = 5.984.
    const result = mostFavourableCheck({
      kapitalertraege: 20000,
      remainingZvE: 60000,
      year: 2026,
      assessmentType: 'zusammen',
      progressionClause: { kind: 'keine' },
    })
    expect(result.flatRateTax).toBe(4500)
    expect(result.personal).toBe(5984)
    expect(result.delta).toBe(1484)
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
    expect(result.flatRateTax).toBe(4750)
    expect(result.personal).toBe(8482)
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
    expect(() => mostFavourableCheck({ ...basis, year: 2023 })).toThrow(RangeError)
  })
})
