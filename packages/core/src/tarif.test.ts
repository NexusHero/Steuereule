import { describe, expect, it } from 'vitest'
import {
  incomeTax,
  isSupportedIncomeTaxYear,
  veranlagungsvergleich,
  type IncomeTaxYear,
} from './tarif'

// #321 strand N — §32a EStG tariff. Every expected number below is a LITERAL constant, not a
// value derived by re-running any formula inside this file — this suite would be worthless
// against wrong coefficients otherwise (Musti,
// https://github.com/NexusHero/Steuereule/issues/321#issuecomment-5255663620 §E: "the tests
// assert against externally published reference values, never against our own output").
//
// See tarif.ts's SOURCE CAVEAT: this sandbox has no live fetch to the primary source, so the
// coefficients are reconstructed from trained knowledge and cross-checked here for internal
// continuity — a fabricated table would not, by chance, produce a continuous curve across
// four independent zone boundaries per year. That is real evidence, but it is not the same
// as a citation to the Bundesgesetzblatt, and this suite says so rather than implying more
// confidence than it has.
//
// Red paths (ADR-0021):
//  - validity: corrupt one coefficient of a supported year (e.g. 2024's zone4Rate) → the
//    zone-4/zone-5 worked-example rows below must go red.
//  - existence (ADR-0021 amendment §1): delete a supported year's entry from TAX_YEARS
//    entirely → 'throws for an unsupported year' must go red for that year, AND it must
//    throw, never silently compute against a neighbouring year — this is
//    `Interview.jsx:28-30`'s defect one level more consequential. Confirm the break landed:
//    deleting 2024 must not leave 2023/2025 passing by coincidence.

describe('incomeTax — §32a EStG Grundtarif', () => {
  describe('the Grundfreibetrag boundary (existence of a floor, not merely its value)', () => {
    const years: readonly IncomeTaxYear[] = [2023, 2024, 2025]

    it.each(years)('year %d: zero at the Grundfreibetrag, still zero one euro above it (floor rounding)', (year) => {
      const grundfreibetrag = { 2023: 10908, 2024: 11604, 2025: 12096 }[year]
      expect(incomeTax(grundfreibetrag, year)).toBe(0)
      // The marginal rate at the Grundfreibetrag starts near zero, so the FLOORED tax stays 0
      // for the first few euro above it (§32a Abs. 1 Satz 6 EStG's own rounding rule, not a
      // bug in this test) — this is itself part of the rounding-rule contract, so it is
      // asserted rather than avoided.
      expect(incomeTax(grundfreibetrag + 1, year)).toBe(0)
      // 100 € into zone 2 the floored tax is reliably positive in all three years.
      expect(incomeTax(grundfreibetrag + 100, year)).toBeGreaterThan(0)
    })

    it('zero well below the Grundfreibetrag too', () => {
      expect(incomeTax(0, 2024)).toBe(0)
      expect(incomeTax(5000, 2024)).toBe(0)
    })
  })

  describe('worked examples, one per zone, hand-computed against the published formula', () => {
    // 2024 — every zone. z/y arithmetic shown so the literal can be checked by hand:
    //   zone 2 (progressive, y-formula):  zvE 12,000 → y=(12000-11604)/10000=0.0396
    //     (922.98·0.0396 + 1400)·0.0396 = 56.887… → floor 56
    //   zone 3 (progressive, z-formula):  zvE 30,000 → z=(30000-17005)/10000=1.2995
    //     (181.19·1.2995 + 2397)·1.2995 + 1025.38 = 4446.257… → floor 4446
    //   zone 4 (linear, 42 %):            zvE 100,000 → 0.42·100000 − 10602.13 = 31397.87 → floor 31397
    //   zone 5 (linear, 45 %, "Reichensteuer"): zvE 300,000 → 0.45·300000 − 18936.88 = 116063.12 → floor 116063
    it.each([
      ['zone 2 (progressive curve 1)', 12000, 56],
      ['zone 3 (progressive curve 2)', 30000, 4446],
      ['zone 4 (linear 42 %)', 100000, 31397],
      ['zone 5 (linear 45 %, Reichensteuer)', 300000, 116063],
    ])('2024, %s: zvE %d € → %d €', (_zone, zvE, expected) => {
      expect(incomeTax(zvE, 2024)).toBe(expected)
    })

    // 2023 spot checks — different coefficients from 2024, so these fail if the table were
    // shared/copy-pasted between years instead of genuinely parameterised.
    it.each([
      ['zone 2', 12000, 164],
      ['zone 3', 20000, 1956],
      ['zone 4', 100000, 32027],
      ['zone 5', 300000, 116692],
    ])('2023, %s: zvE %d € → %d €', (_zone, zvE, expected) => {
      expect(incomeTax(zvE, 2023)).toBe(expected)
    })

    // 2025 spot checks.
    it.each([
      ['zone 2', 13000, 134],
      ['zone 3', 30000, 4303],
      ['zone 4', 100000, 31088],
      ['zone 5', 300000, 115753],
    ])('2025, %s: zvE %d € → %d €', (_zone, zvE, expected) => {
      expect(incomeTax(zvE, 2025)).toBe(expected)
    })
  })

  describe('the same zvE is genuinely year-dependent', () => {
    // 12,000 € sits above 2023's and 2024's Grundfreibetrag but AT/below 2025's (12,096 €) —
    // this fails if a year parameter were accepted but silently ignored.
    it('zvE 12,000 € is taxed in 2023 and 2024 but not in 2025', () => {
      expect(incomeTax(12000, 2023)).toBe(164)
      expect(incomeTax(12000, 2024)).toBe(56)
      expect(incomeTax(12000, 2025)).toBe(0)
    })
  })

  describe('the rounding rule is part of the contract (§32a Abs. 1 Satz 6 EStG)', () => {
    it('floors a fractional zvE to the full euro before computing', () => {
      expect(incomeTax(12000.99, 2024)).toBe(incomeTax(12000, 2024))
    })

    it('the result itself is a whole-euro integer, never a fraction', () => {
      expect(Number.isInteger(incomeTax(30000, 2024))).toBe(true)
    })
  })

  describe('input validity', () => {
    it('rejects a negative zvE', () => {
      expect(() => incomeTax(-1, 2024)).toThrow(RangeError)
    })

    it('rejects a non-finite zvE', () => {
      expect(() => incomeTax(Number.NaN, 2024)).toThrow(RangeError)
      expect(() => incomeTax(Number.POSITIVE_INFINITY, 2024)).toThrow(RangeError)
    })
  })

  describe('an unsupported year THROWS — it never falls back to a neighbouring year', () => {
    // This is the ticket's own named defect, one level more consequential:
    // `Interview.jsx:28-30` hard-wires 2026's WERK/FEI tables; a 2027 row computed with them
    // would be silently wrong. This module refuses to repeat that shape for itself.
    it.each([2020, 2022, 2026, 2030])('year %d has no coefficients and must throw, not approximate', (year) => {
      expect(() => incomeTax(30000, year)).toThrow(RangeError)
      expect(() => incomeTax(30000, year)).toThrow(/unsupported/i)
    })

    it('isSupportedIncomeTaxYear agrees with incomeTax on the boundary', () => {
      expect(isSupportedIncomeTaxYear(2024)).toBe(true)
      expect(isSupportedIncomeTaxYear(2026)).toBe(false)
    })
  })

  describe('zone-boundary continuity (a fabricated or mistyped coefficient set would not pass this by chance)', () => {
    const years: readonly IncomeTaxYear[] = [2023, 2024, 2025]
    const boundaries = { 2023: [15999, 62809, 277825], 2024: [17005, 66760, 277825], 2025: [17443, 68480, 277825] }

    it.each(years)('year %d: no discontinuity across any zone boundary', (year) => {
      for (const boundary of boundaries[year]) {
        const below = incomeTax(boundary, year)
        const above = incomeTax(boundary + 1, year)
        // Marginal tax on one extra euro can never be negative, and — at these zone widths —
        // never exceeds a few euro either. A genuine cliff (a wrong constant) fails this.
        expect(above).toBeGreaterThanOrEqual(below)
        expect(above - below).toBeLessThanOrEqual(5)
      }
    })
  })
})

describe('veranlagungsvergleich — Günstigerprüfung (product ADR-006)', () => {
  // gemeinsam = ⌊(60000+20000)/2⌋ = 40000, so:
  //   zusammen = 2 × incomeTax(40000, 2024) = 14990
  //   einzeln  = incomeTax(60000, 2024) + incomeTax(20000, 2024) = 16439
  it('splitting helps when incomes differ — recommends Zusammenveranlagung', () => {
    const result = veranlagungsvergleich(60000, 20000, 2024)
    expect(result.zusammenTax).toBe(14990)
    expect(result.einzelTax).toBe(16439)
    expect(result.delta).toBe(-1449)
    expect(result.empfehlung).toBe('zusammenveranlagung')
  })

  it('extreme income gap — splitting helps even more', () => {
    const result = veranlagungsvergleich(0, 80000, 2024)
    expect(result.zusammenTax).toBe(14990)
    expect(result.einzelTax).toBe(22997)
    expect(result.empfehlung).toBe('zusammenveranlagung')
  })

  // The boundary that catches a hard-coded/fixed recommendation (N2's own red path, Musti's
  // comment §F): equal incomes carry zero Splitting-Vorteil, so the correct call is
  // 'einzelveranlagung' — a `return 'zusammenveranlagung'` regardless of input passes every
  // other case in this file and only fails here.
  it('equal incomes — zero advantage, recommends Einzelveranlagung, not a fixed winner', () => {
    const result = veranlagungsvergleich(40000, 40000, 2024)
    expect(result.zusammenTax).toBe(result.einzelTax)
    expect(result.delta).toBe(0)
    expect(result.empfehlung).toBe('einzelveranlagung')
  })

  it('is symmetric — swapping the two people does not change the result', () => {
    const a = veranlagungsvergleich(60000, 20000, 2024)
    const b = veranlagungsvergleich(20000, 60000, 2024)
    expect(b).toEqual(a)
  })

  it('rejects a negative zvE for either person', () => {
    expect(() => veranlagungsvergleich(-1, 20000, 2024)).toThrow(RangeError)
    expect(() => veranlagungsvergleich(20000, -1, 2024)).toThrow(RangeError)
  })

  it('rejects a non-finite zvE for either person', () => {
    expect(() => veranlagungsvergleich(Number.NaN, 20000, 2024)).toThrow(RangeError)
    expect(() => veranlagungsvergleich(20000, Number.NaN, 2024)).toThrow(RangeError)
  })

  it('propagates the unsupported-year throw — the comparison is only ever as exact as `incomeTax`', () => {
    expect(() => veranlagungsvergleich(60000, 20000, 2026)).toThrow(RangeError)
  })
})
