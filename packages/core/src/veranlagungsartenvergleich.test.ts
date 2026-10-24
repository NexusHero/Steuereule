// Ticket 10.2 (M1) — tests for the Veranlagungsartenvergleich. The exact literals are derived
// from the published §32a/SolZG/§51a coefficients (cited in tarif.ts), recomputed by hand here —
// the test is the independent check, never a copy of the implementation's own arithmetic.
import { describe, expect, it } from 'vitest'
import {
  veranlagungsartenvergleich,
  type Veranlagungsartenvergleich,
} from './veranlagungsartenvergleich'

// 2026: incomeTax(100000)=30864, incomeTax(50000)=10548, incomeTax(60000)=14233,
// incomeTax(40000)=7209. Soli-Einzel-Freigrenze 20350, zusammen 40700.
describe('veranlagungsartenvergleich — ADR-0034 bounded comparison', () => {
  it('reaches `eindeutig` over a real zvE path (the M1 gate is open)', () => {
    const result = veranlagungsartenvergleich({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(result.aussage).toBe('eindeutig')
    if (result.aussage === 'eindeutig') {
      expect(result.empfehlung).toBe('zusammen')
    }
    expect(result.einzel).toBe(32115) // 30864 ESt + 1251 Soli
    expect(result.zusammen).toBe(21096) // 2 × 10548, Soli 0 (unter Freigrenze)
    expect(result.delta).toBe(-11019)
    expect(result.unschaerfe).toEqual({ kind: 'bestimmt', obergrenze: 0 })
  })

  it('carries Herkunfts-Metadaten on both numbers (zvE-Basen + Bestandteile)', () => {
    const result = veranlagungsartenvergleich({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(result.herkunft).toEqual({
      zveA: 100000,
      zveB: 0,
      bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'],
    })
  })

  it('includes Kirchensteuer in the numbers (and the Bestandteile) when a factor is given', () => {
    const result = veranlagungsartenvergleich({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
      kirchensteuerFaktor: 0.09,
    })
    expect(result.herkunft.bestandteile).toEqual(['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'])
    expect(result.einzel).toBe(34892) // 30864 ESt + 1251 Soli + 2777 KiSt
    expect(result.zusammen).toBe(22994) // 21096 ESt + 1898 KiSt
    expect(result.delta).toBe(-11898)
  })

  it('is `zu-knapp` when the delta is zero (equal incomes, no Splitting gain)', () => {
    const result = veranlagungsartenvergleich({
      zveA: 60000,
      zveB: 60000,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(result.aussage).toBe('zu-knapp')
    expect(result.delta).toBe(0)
    expect(result.einzel).toBe(result.zusammen)
  })

  it('lets the Progressionsvorbehalt-Schranke push a clear delta into `zu-knapp`', () => {
    const ohneLohnersatz = veranlagungsartenvergleich({
      zveA: 60000,
      zveB: 40000,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
    })
    expect(ohneLohnersatz.aussage).toBe('eindeutig')
    expect(ohneLohnersatz.delta).toBe(-346)

    // 0.45 × 1000 = 450 > |−346| → inside the noise floor.
    const mitLohnersatz = veranlagungsartenvergleich({
      zveA: 60000,
      zveB: 40000,
      year: 2026,
      progressionsvorbehalt: { art: 'lohnersatzleistungen', betrag: 1000 },
    })
    expect(mitLohnersatz.aussage).toBe('zu-knapp')
    expect(mitLohnersatz.unschaerfe).toEqual({ kind: 'bestimmt', obergrenze: 450 })
  })

  it('is `unbestimmt` (and never `eindeutig`) when Progressionsvorbehalt is not given', () => {
    const result = veranlagungsartenvergleich({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionsvorbehalt: { art: 'nicht-angegeben' },
    })
    expect(result.aussage).toBe('unbestimmt')
    expect(result.unschaerfe).toEqual({ kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' })
  })

  it('throws for negative zvE, an unsupported year, or a negative Lohnersatz-Betrag', () => {
    expect(() =>
      veranlagungsartenvergleich({ zveA: -1, zveB: 0, year: 2026, progressionsvorbehalt: { art: 'keine' } }),
    ).toThrow(RangeError)
    expect(() =>
      veranlagungsartenvergleich({ zveA: 1000, zveB: 0, year: 2023, progressionsvorbehalt: { art: 'keine' } }),
    ).toThrow(RangeError)
    expect(() =>
      veranlagungsartenvergleich({
        zveA: 1000,
        zveB: 0,
        year: 2026,
        progressionsvorbehalt: { art: 'lohnersatzleistungen', betrag: -5 },
      }),
    ).toThrow(RangeError)
  })

  it('makes the verdict unreadable without reading `aussage` first (compiler refuses the shortcut)', () => {
    const result: Veranlagungsartenvergleich = veranlagungsartenvergleich({
      zveA: 100000,
      zveB: 0,
      year: 2026,
      progressionsvorbehalt: { art: 'keine' },
    })
    // @ts-expect-error — `empfehlung` exists only on the `eindeutig` variant; a bare read
    // without narrowing `aussage` first is a type error (ADR-0034: unrepresentable-to-skip).
    void result.empfehlung
    expect(result.aussage === 'eindeutig' || result.aussage === 'zu-knapp' || result.aussage === 'unbestimmt').toBe(true)
  })
})
