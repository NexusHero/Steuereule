// Ticket 10.2 (M1) — tests for the §32a/Soli/KiSt tariff module. Every exact literal below is
// derived from the published coefficients (cited in tarif.ts's header), not re-derived from the
// implementation — the test is the independent check, not a tautology. Continuity assertions brace
// the zone boundaries against each other (the same real evidence kaan/321's tarif.test.ts relied on).
import { describe, expect, it } from 'vitest'
import {
  incomeTax,
  isSupportedIncomeTaxYear,
  kirchensteuer,
  solidaritaetszuschlag,
  splittingTarif,
  zoneBoundaries,
  type IncomeTaxYear,
} from './tarif'

describe('incomeTax — §32a EStG Grundtarif', () => {
  it('is zero at and below the Grundfreibetrag for every supported year', () => {
    expect(incomeTax(0, 2024)).toBe(0)
    expect(incomeTax(11784, 2024)).toBe(0)
    expect(incomeTax(12096, 2025)).toBe(0)
    expect(incomeTax(12348, 2026)).toBe(0)
  })

  it('computes the exact 42 % zone (linear) for clean inputs', () => {
    // 0.42 × 100000 − sub, floored — sub per year (2024: 10636.31, 2025: 10911.92, 2026: 11135.63).
    expect(incomeTax(100000, 2024)).toBe(31363)
    expect(incomeTax(100000, 2025)).toBe(31088)
    expect(incomeTax(100000, 2026)).toBe(30864)
  })

  it('computes the exact 45 % zone ("Reichensteuer") for clean inputs', () => {
    // 0.45 × 300000 − sub (2026: 19470.38).
    expect(incomeTax(300000, 2026)).toBe(115529)
  })

  it('is monotonically non-decreasing across the whole curve', () => {
    let prev = incomeTax(0, 2026)
    for (let zvE = 1; zvE <= 280000; zvE += 5000) {
      const now = incomeTax(zvE, 2026)
      expect(now).toBeGreaterThanOrEqual(prev)
      prev = now
    }
  })

  it('rounds the zvE DOWN to the full euro before the formula (§32a Abs. 1 Satz 1)', () => {
    expect(incomeTax(100000.9, 2026)).toBe(incomeTax(100000, 2026))
    expect(incomeTax(99999.5, 2025)).toBe(incomeTax(99999, 2025))
  })

  it('is continuous at the zone boundaries (zone 2 → zone 3 → zone 4)', () => {
    for (const year of [2024, 2025, 2026] as const) {
      const [z2, z3, z4] = zoneBoundaries(year)
      // The published zone-3 formula at z2 equals the zone-2 formula at z2 (continuity); the
      // floor may differ by at most 1 euro across the boundary — never a jump.
      expect(Math.abs(incomeTax(z2 + 1, year) - incomeTax(z2, year))).toBeLessThanOrEqual(1)
      expect(Math.abs(incomeTax(z3 + 1, year) - incomeTax(z3, year))).toBeLessThanOrEqual(1)
      expect(Math.abs(incomeTax(z4 + 1, year) - incomeTax(z4, year))).toBeLessThanOrEqual(2)
    }
  })

  it('throws for a negative or non-finite zvE', () => {
    expect(() => incomeTax(-1, 2026)).toThrow(RangeError)
    expect(() => incomeTax(Number.NaN, 2026)).toThrow(RangeError)
    expect(() => incomeTax(Number.POSITIVE_INFINITY, 2026)).toThrow(RangeError)
  })

  it('throws for an unsupported year rather than approximating', () => {
    expect(() => incomeTax(50000, 2023)).toThrow(RangeError)
    expect(() => incomeTax(50000, 2027)).toThrow(RangeError)
  })
})

describe('isSupportedIncomeTaxYear / zoneBoundaries', () => {
  it('accepts only integer years this module holds coefficients for', () => {
    expect(isSupportedIncomeTaxYear(2024)).toBe(true)
    expect(isSupportedIncomeTaxYear(2025)).toBe(true)
    expect(isSupportedIncomeTaxYear(2026)).toBe(true)
    expect(isSupportedIncomeTaxYear(2023)).toBe(false)
    expect(isSupportedIncomeTaxYear(2024.5)).toBe(false)
  })

  it('returns the ascending zone boundaries', () => {
    expect(zoneBoundaries(2026)).toEqual([17799, 69878, 277825])
  })
})

describe('splittingTarif — §32a Abs. 5 Splitting-Verfahren', () => {
  it('is twice the Grundtarif on the floored half of the combined zvE', () => {
    expect(splittingTarif(100000, 0, 2026)).toBe(2 * incomeTax(50000, 2026))
    expect(splittingTarif(60000, 20000, 2026)).toBe(2 * incomeTax(40000, 2026))
    expect(splittingTarif(99999.5, 0, 2026)).toBe(2 * incomeTax(49999, 2026))
  })

  it('throws for negative inputs', () => {
    expect(() => splittingTarif(-1, 0, 2026)).toThrow(RangeError)
  })
})

describe('solidaritaetszuschlag — §4 SolZG', () => {
  // 2025 Einzel-Freigrenze 19.950 € (§3 Abs. 3 SolZG).
  it('is zero at and below the Freigrenze', () => {
    expect(solidaritaetszuschlag(0, 19950)).toBe(0)
    expect(solidaritaetszuschlag(19950, 19950)).toBe(0)
  })

  it('applies the Milderungszone cap (11.9 % of ESt − Freigrenze)', () => {
    // min(5.5 % × 30000, 11.9 % × (30000 − 19950)) = min(1650, 1195.95) → 1195.
    expect(solidaritaetszuschlag(30000, 19950)).toBe(1195)
  })

  it('applies the full 5.5 % above the Milderungszone', () => {
    // Milderungszone ends at 1.859375 × Freigrenze ≈ 37094; 40000 is above it → 5.5 %.
    expect(solidaritaetszuschlag(40000, 19950)).toBe(2200)
  })

  it('scales the Freigrenze for joint filing (Zusammenveranlagung = 2 ×)', () => {
    // Joint 2025 Freigrenze 39.900 €.
    expect(solidaritaetszuschlag(39900, 39900)).toBe(0)
    // min(5.5 % × 60000, 11.9 % × (60000 − 39900)) = min(3300, 2391.9) → 2391.
    expect(solidaritaetszuschlag(60000, 39900)).toBe(2391)
  })
})

describe('kirchensteuer — §51a EStG', () => {
  it('is zero for faktor 0', () => {
    expect(kirchensteuer(10000, 0)).toBe(0)
  })

  it('applies the 8 % and 9 % factors', () => {
    expect(kirchensteuer(10000, 0.08)).toBe(800)
    expect(kirchensteuer(10000, 0.09)).toBe(900)
  })

  it('rejects any factor outside the closed set {0, 0.08, 0.09}', () => {
    expect(() => kirchensteuer(10000, 0.07 as never)).toThrow(RangeError)
    expect(() => kirchensteuer(10000, -1 as never)).toThrow(RangeError)
  })
})

// Compile-time guard: the year union stays exactly {2024, 2025, 2026}.
const _allYears: readonly IncomeTaxYear[] = [2024, 2025, 2026]
void _allYears
