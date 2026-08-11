import { describe, expect, it } from 'vitest'
import {
  incomeTax,
  isSupportedIncomeTaxYear,
  veranlagungsvergleich,
  zoneBoundaries,
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
// three independent zone boundaries per year. That is real evidence, but it is not the same
// as a citation to the Bundesgesetzblatt, and this suite says so rather than implying more
// confidence than it has.
//
// F1 (PR #340 review, BLOCKING, still open): this internal-continuity claim is real but
// weaker than the header above implies — every expectation in this file is hand-recomputed
// from the SAME TAX_YEARS table the code reads, so a wrong-but-self-consistent table (Musti
// proved this by substituting 2025's entry with 2024's verbatim) makes code and test wrong
// together and the suite stays green (36/36). See the `it.todo` block below: this file does
// not yet carry a single expectation whose provenance is a citation rather than a
// recomputation, and this sandbox cannot reach a primary source to supply one (see tarif.ts's
// SOURCE CAVEAT). Reported to the stakeholder in the PR rather than guessed at.
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

    // F6 (PR #340 review, blocking): TAX_YEARS' keys are object-property strings, so a bare
    // hasOwnProperty check treats the STRING '2024' as a supported year too — exactly the
    // untyped boundary this guard exists to hold, since `year` arrives from a path/query
    // parameter (R1-R4) as a string. Both measured broken before the fix: `4446` returned
    // without throwing, and `isSupportedIncomeTaxYear` returned `true`.
    it('rejects the string "2024" — a non-integer year must never pass, even a numeral one', () => {
      // Deliberately mistyped: proves the runtime guard, not just the TS type, holds at the
      // untyped boundary a caller (R1-R4) actually crosses it from.
      expect(isSupportedIncomeTaxYear('2024' as unknown as number)).toBe(false)
      expect(() => incomeTax(30000, '2024' as unknown as number)).toThrow(RangeError)
    })
  })

  describe('zone-boundary continuity (a fabricated or mistyped coefficient set would not pass this by chance)', () => {
    const years: readonly IncomeTaxYear[] = [2023, 2024, 2025]

    it.each(years)('year %d: no discontinuity across any zone boundary', (year) => {
      // F7 (PR #340 review): the boundaries are read from the module itself
      // (`zoneBoundaries`), not duplicated in a second, hand-maintained literal here — a
      // duplicate silently stops tracking TAX_YEARS the moment either drifts from the other.
      for (const boundary of zoneBoundaries(year)) {
        const below = incomeTax(boundary, year)
        const above = incomeTax(boundary + 1, year)
        // Marginal tax on one extra euro can never be negative, and is at most 0.45 € (the
        // steepest zone's rate), so the floored step is 0 or 1 — never more (F7: the previous
        // `≤ 5` bound was ~10× too loose and would tolerate a genuine cliff).
        expect(above).toBeGreaterThanOrEqual(below)
        expect(above - below).toBeLessThanOrEqual(1)
      }
    })
  })
})

describe('veranlagungsvergleich — Veranlagungsartenvergleich (Produkt-ADR-006)', () => {
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

  // F2 (PR #340 review, blocking): `delta` is not "zero or negative whenever coupling helps
  // or is neutral" — it CAN be positive, and this was previously untested (the only
  // 'einzelveranlagung' case in this file was the exact tie above). Musti measured 156,063
  // such pairs over a sampled 2024 grid; this is the smallest.
  //   gemeinsam = ⌊(11931+12017)/2⌋ = 11974
  //   zusammen  = 2 × incomeTax(11974, 2024) = 2 × 53  = 106
  //   einzeln   = incomeTax(11931, 2024) + incomeTax(12017, 2024) = 46 + 59 = 105
  //   delta     = +1  →  'einzelveranlagung'
  // Legally correct, not a math defect: the floored (assessed) amounts are what the statute
  // taxes, and unfloored Zusammenveranlagung is genuinely cheaper (106.127 vs 106.161) —
  // statutory rounding inverts a sub-euro advantage in this narrow band.
  it('a narrow band near equal incomes can flip delta positive — statutory flooring, not a fixed winner', () => {
    const result = veranlagungsvergleich(11931, 12017, 2024)
    expect(result.zusammenTax).toBe(106)
    expect(result.einzelTax).toBe(105)
    expect(result.delta).toBe(1)
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

// F1 (PR #340 review, BLOCKING — still open). Musti's proof: replace 2025's TAX_YEARS entry
// with 2024's coefficients verbatim, rederive every literal above from that (wrong) table by
// hand — 36/36 still passes. Every expectation in this file shares its origin with the code
// under test, so a self-consistent-but-wrong coefficient table is invisible to this suite. The
// continuity checks above are real evidence (they DID catch a mis-recalled Grundfreibetrag,
// 1/36 failed), but they brace coefficients against each other, not against reality.
//
// Musti's stated remedy: pin at least one independently published ESt amount per year — a
// value from the amtliche Grundtabelle or a BMF-Steuerrechner (bmf-steuerrechner.de) output —
// whose provenance is a citation, not a recomputation.
//
// This sandbox cannot supply that citation: outbound HTTPS to non-allowlisted hosts is
// proxy-denied (reconfirmed while fixing this finding — CONNECT to www.bmf-steuerrechner.de
// and www.gesetze-im-internet.de both 403'd at the gateway, see tarif.ts's SOURCE CAVEAT).
// Inventing a "published" figure here would be exactly the dishonesty ADR-0032 forbids,
// applied to a test file instead of a screen. So this stays `it.todo` — deliberately not
// passing, not silently green — until a human with network access supplies the values below.
//
// TODO(provenance, blocks F1 — needs a human with network access):
// For each of 2023 / 2024 / 2025, one (zvE, tax) pair read by hand off the amtliche
// ESt-Grundtabelle or a BMF-Steuerrechner run (https://www.bmf-steuerrechner.de/), cited with
// URL + retrieval date in the test body. Once supplied, un-skip these three and assert
// `incomeTax(zvE, year) === tax` with `tax` typed in as a literal, never computed in this file.
describe.todo('published-value anchors — provenance is a citation, not a recomputation (F1)', () => {
  it.todo('2023: incomeTax(<zvE>, 2023) === <published tax> — cite source + retrieval date')
  it.todo('2024: incomeTax(<zvE>, 2024) === <published tax> — cite source + retrieval date')
  it.todo('2025: incomeTax(<zvE>, 2025) === <published tax> — cite source + retrieval date')
})
