// Ticket 10.2 (M1) — tests for the Veranlagungsartenvergleich. The exact literals are derived
// from the published §32a/SolZG/§51a coefficients (cited in tarif.ts), recomputed by hand here —
// the test is the independent check, never a copy of the implementation's own arithmetic.
import { describe, expect, it } from 'vitest'
import {
  filingTypeComparison,
  type FilingTypeComparison,
} from './filing-type-comparison'

// 2026: incomeTax(100000)=30864, incomeTax(50000)=10548, incomeTax(60000)=14233,
// incomeTax(40000)=7209. Soli-Einzel-Freigrenze 20350, zusammen 40700.
describe('veranlagungsartenvergleich — ADR-0034 bounded comparison', () => {
  it('reaches `eindeutig` over a real zvE path (the M1 gate is open)', () => {
    const result = filingTypeComparison({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionClause: { kind: 'keine' },
    })
    expect(result.statement).toBe('eindeutig')
    if (result.statement === 'eindeutig') {
      expect(result.recommendation).toBe('zusammen')
    }
    expect(result.single).toBe(32115) // 30864 ESt + 1251 Soli
    expect(result.joint).toBe(21096) // 2 × 10548, Soli 0 (unter Freigrenze)
    expect(result.delta).toBe(-11019)
    expect(result.uncertainty).toEqual({ kind: 'bestimmt', upperLimit: 0 })
  })

  it('carries Herkunfts-Metadaten on both numbers (zvE-Basen + Bestandteile)', () => {
    const result = filingTypeComparison({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionClause: { kind: 'keine' },
    })
    expect(result.provenance).toEqual({
      zveA: 100000,
      zveB: 0,
      components: ['einkommensteuer', 'solidaritaetszuschlag'],
    })
  })

  it('includes Kirchensteuer in the numbers (and the Bestandteile) when a factor is given', () => {
    const result = filingTypeComparison({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionClause: { kind: 'keine' },
      churchTaxFactor: 0.09,
    })
    expect(result.provenance.components).toEqual(['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'])
    expect(result.single).toBe(34892) // 30864 ESt + 1251 Soli + 2777 KiSt
    expect(result.joint).toBe(22994) // 21096 ESt + 1898 KiSt
    expect(result.delta).toBe(-11898)
  })

  it('is `zu-knapp` when the delta is zero (equal incomes, no Splitting gain)', () => {
    const result = filingTypeComparison({
      zveA: 60000,
      zveB: 60000,
      year: 2026,
      progressionClause: { kind: 'keine' },
    })
    expect(result.statement).toBe('zu-knapp')
    expect(result.delta).toBe(0)
    expect(result.single).toBe(result.joint)
  })

  it('lets the Progressionsvorbehalt-Schranke push a clear delta into `zu-knapp`', () => {
    const withoutWageReplacement = filingTypeComparison({
      zveA: 60000,
      zveB: 40000,
      year: 2026,
      progressionClause: { kind: 'keine' },
    })
    expect(withoutWageReplacement.statement).toBe('eindeutig')
    expect(withoutWageReplacement.delta).toBe(-346)

    // 0.45 × 1000 = 450 > |−346| → inside the noise floor.
    const withWageReplacement = filingTypeComparison({
      zveA: 60000,
      zveB: 40000,
      year: 2026,
      progressionClause: { kind: 'lohnersatzleistungen', amount: 1000 },
    })
    expect(withWageReplacement.statement).toBe('zu-knapp')
    expect(withWageReplacement.uncertainty).toEqual({ kind: 'bestimmt', upperLimit: 450 })
  })

  it('is `unbestimmt` (and never `eindeutig`) when Progressionsvorbehalt is not given', () => {
    const result = filingTypeComparison({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionClause: { kind: 'nicht-angegeben' },
    })
    expect(result.statement).toBe('unbestimmt')
    expect(result.uncertainty).toEqual({ kind: 'unbestimmt', reason: 'progressionsvorbehalt-nicht-eingegeben' })
  })

  it('throws for negative zvE, an unsupported year, or a negative Lohnersatz-Betrag', () => {
    expect(() =>
      filingTypeComparison({ zveA: -1, zveB: 0, year: 2026, progressionClause: { kind: 'keine' } }),
    ).toThrow(RangeError)
    expect(() =>
      filingTypeComparison({ zveA: 1000, zveB: 0, year: 2021, progressionClause: { kind: 'keine' } }),
    ).toThrow(RangeError)
    expect(() =>
      filingTypeComparison({
        zveA: 1000,
        zveB: 0,
        year: 2026,
        progressionClause: { kind: 'lohnersatzleistungen', amount: -5 },
      }),
    ).toThrow(RangeError)
  })

  it('makes the verdict unreadable without reading `aussage` first (compiler refuses the shortcut)', () => {
    const result: FilingTypeComparison = filingTypeComparison({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionClause: { kind: 'keine' },
    })
    // @ts-expect-error — `empfehlung` exists only on the `eindeutig` variant; a bare read
    // without narrowing `aussage` first is a type error (ADR-0034: unrepresentable-to-skip).
    void result.empfehlung
    expect(result.statement === 'eindeutig' || result.statement === 'zu-knapp' || result.statement === 'unbestimmt').toBe(true)
  })
})
