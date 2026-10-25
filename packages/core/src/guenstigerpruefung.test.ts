import { describe, expect, it } from 'vitest'
import { guenstigerpruefung } from './guenstigerpruefung'

// Ticket 10.5 — die Günstigerprüfung (§ 32d Abs. 6 EStG), bounded comparison nach dem
// ADR-0034-Muster. The expected amounts below are hand-computed from the cited statutory
// rules (§ 32d Abs. 1/6, § 20 Abs. 9, § 32a, § 4 SolZG, § 51a EStG) with the 2026
// coefficients of tarif.ts — the tests pin the contract, not a magic number.

describe('guenstigerpruefung — the two amounts (Ebene 2, exakt gegeben die Eingaben)', () => {
  it('computes the Abgeltungsteuer: 25 % on Kapitalerträge minus Sparerpauschbetrag, plus Soli', () => {
    // 20.000 − 1.000 = 19.000 → 4.750 Abgeltungsteuer; Soli 0 (unter der Freigrenze 20.350).
    const result = guenstigerpruefung({
      kapitalertraege: 20000,
      uebrigesZvE: 60000,
      year: 2026,
      veranlagung: 'einzel',
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(result.abgeltung).toBe(4750)
    // Persönlich: (22.464 − 14.233) + Soli-Differenz (251 − 0, Milderungszone über der Freigrenze
    // 20.350) = 8.231 + 251 = 8.482.
    expect(result.persoenlich).toBe(8482)
    expect(result.delta).toBe(3732)
    expect(result.herkunft).toEqual({
      kapitalertraege: 20000,
      uebrigesZvE: 60000,
      sparerpauschbetrag: 1000,
      veranlagung: 'einzel',
      bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'],
    })
  })

  it('folds Kirchensteuer into both sides, including the § 32d Abs. 1 Satz 4 Ermäßigung', () => {
    // Abgeltung: 99.000 × 25 % = 24.750; Soli (Milderungszone) 523; KiSt 2.227, Ermäßigung 25 % = 556
    // → 24.750 − 556 + 2.227 + 523 = 26.944.
    const result = guenstigerpruefung({
      kapitalertraege: 100000,
      uebrigesZvE: 300000,
      year: 2026,
      veranlagung: 'einzel',
      progressionsvorbehalt: { art: 'keine' },
      kirchensteuerFaktor: 0.09,
    })
    expect(result.abgeltung).toBe(26944)
    // Persönlich: (160.529 − 115.529) + (8.829 − 6.354) + 4.050 = 45.000 + 2.475 + 4.050 = 51.525.
    expect(result.persoenlich).toBe(51525)
    expect(result.delta).toBe(24581)
    if (result.herkunft) {
      expect(result.herkunft.bestandteile).toEqual(['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'])
    }
  })

  it('computes the Zusammenveranlagung side via the Splitting tariff on the combined basis', () => {
    // Abgeltung: (20.000 − 2.000) × 25 % = 4.500; Soli 0 (unter der Freigrenze 40.700).
    // Persönlich: splitting(80.000) − splitting(60.000) = 14.418 − 8.434 = 5.984.
    const result = guenstigerpruefung({
      kapitalertraege: 20000,
      uebrigesZvE: 60000,
      year: 2026,
      veranlagung: 'zusammen',
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(result.abgeltung).toBe(4500)
    expect(result.persoenlich).toBe(5984)
    expect(result.delta).toBe(1484)
    expect(result.herkunft.sparerpauschbetrag).toBe(2000)
    expect(result.herkunft.veranlagung).toBe('zusammen')
  })
})

describe('guenstigerpruefung — the bounded verdict (ADR-0034 Entscheidung 2)', () => {
  const basis = {
    kapitalertraege: 20000,
    uebrigesZvE: 60000,
    year: 2026,
    veranlagung: 'einzel' as const,
  }

  it('is eindeutig with empfehlung when |delta| exceeds the Progressionsvorbehalt-Schranke', () => {
    const abgeltungGuenstiger = guenstigerpruefung({ ...basis, progressionsvorbehalt: { art: 'keine' } })
    expect(abgeltungGuenstiger.aussage).toBe('eindeutig')
    if (abgeltungGuenstiger.aussage === 'eindeutig') {
      expect(abgeltungGuenstiger.empfehlung).toBe('abgeltung') // delta = +3.481
    }

    // Geringverdiener: persönlicher Satz 0 < Abgeltungsteuer 1.000 → persönlich günstiger.
    const persoenlichGuenstiger = guenstigerpruefung({
      kapitalertraege: 5000,
      uebrigesZvE: 0,
      year: 2026,
      veranlagung: 'einzel',
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(persoenlichGuenstiger.aussage).toBe('eindeutig')
    if (persoenlichGuenstiger.aussage === 'eindeutig') {
      expect(persoenlichGuenstiger.empfehlung).toBe('persoenlich')
    }
  })

  it('is zu-knapp when the delta lies inside the computed Schranke — no verdict', () => {
    // Lohnersatz 20.000 → Schranke ⌈0,45 × 20.000⌉ = 9.000; |delta| = 3.732 ≤ 9.000.
    const result = guenstigerpruefung({
      ...basis,
      progressionsvorbehalt: { art: 'lohnersatzleistungen', betrag: 20000 },
    })
    expect(result.aussage).toBe('zu-knapp')
    if (result.aussage === 'zu-knapp') {
      expect(result.unschaerfe).toEqual({ kind: 'bestimmt', obergrenze: 9000 })
    }
    // A bare verdict is unrepresentable: zu-knapp has no empfehlung field at all.
    expect('empfehlung' in result).toBe(false)
  })

  it('is unbestimmt when the Progressionsvorbehalt is not bounded — no verdict possible', () => {
    const result = guenstigerpruefung({ ...basis, progressionsvorbehalt: { art: 'nicht-angegeben' } })
    expect(result.aussage).toBe('unbestimmt')
    if (result.aussage === 'unbestimmt') {
      expect(result.unschaerfe).toEqual({ kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' })
    }
    expect('empfehlung' in result).toBe(false)
    // The two amounts are still exact — only the verdict is withheld.
    expect(result.abgeltung).toBe(4750)
    expect(result.persoenlich).toBe(8482)
  })
})

describe('guenstigerpruefung — validation (throw, don\'t approximate)', () => {
  const basis = {
    kapitalertraege: 20000,
    uebrigesZvE: 60000,
    year: 2026,
    veranlagung: 'einzel' as const,
    progressionsvorbehalt: { art: 'keine' as const },
  }

  it('throws on negative or non-integer inputs', () => {
    expect(() => guenstigerpruefung({ ...basis, kapitalertraege: -1 })).toThrow(RangeError)
    expect(() => guenstigerpruefung({ ...basis, uebrigesZvE: -1 })).toThrow(RangeError)
    expect(() => guenstigerpruefung({ ...basis, kapitalertraege: 1.5 })).toThrow(RangeError)
    expect(() => guenstigerpruefung({ ...basis, uebrigesZvE: 1.5 })).toThrow(RangeError)
  })

  it('throws on an unsupported tax year — never falls back to a neighbour year', () => {
    expect(() => guenstigerpruefung({ ...basis, year: 2023 })).toThrow(RangeError)
  })
})
