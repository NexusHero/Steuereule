// REQ-016 (register row owed by Suhay per #321's DoR, ADR-0025) — §32a EStG income tax
// tariff, parameterised by tax year. Built as the N strand of #321's build plan (Musti,
// https://github.com/NexusHero/Steuereule/issues/321#issuecomment-5255663620 §E) — the one
// substantial piece of that slice not sitting behind an API endpoint, so it starts on day
// one. The engineering ADR for this contract is Musti's to write before N2 is wired to a
// screen (§321#issuecomment-5255663620 §E: "It needs an ADR, and I am writing it"); this
// module implements the contract his comment already states, and is re-cited once the ADR
// number exists.
//
// THREE ACCURACY LAYERS — and only the first two are claimed by this module:
//
//  1. `incomeTax(zvE, year)` is EXACT for a given zvE. §32a EStG is a closed piecewise
//     formula; exactness is achievable and checkable. The rounding rule is part of the legal
//     contract, not an implementation detail: zvE is floored to the full euro BEFORE the
//     formula runs, and the resulting tax is floored to the full euro AFTER (§32a Abs. 1
//     Satz 6 EStG) — leaving either implicit is how two correct-looking implementations
//     disagree by a euro.
//  2. `veranlagungsvergleich` is EXACT GIVEN two zvE values — integer/float arithmetic over
//     two calls to `incomeTax`, no approximation anywhere in the path:
//     `2 × incomeTax(⌊(zvE_A + zvE_B) / 2⌋, year)` against
//     `incomeTax(zvE_A, year) + incomeTax(zvE_B, year)`.
//  3. NEITHER OF THE ABOVE SAYS ANYTHING ABOUT THE ACCURACY OF THE zvE THAT GOES IN, and this
//     module deliberately does not try to supply one — #321 §A leaves "which figure" an open
//     stakeholder call. An exact tariff over a coarse input reads as authoritative PRECISELY
//     BECAUSE it is precise. A caller may render this module's output as a recommendation
//     only once #321 §A's income-figure question is settled AND product ADR-032 §1's origin
//     requirement (HerkunftsChip: Regel + Rechenweg) is met on screen.
//
// EXPLICITLY NOT COMPUTED HERE, and this is a finding, not a caveat: Solidaritätszuschlag,
// Kirchensteuer, Progressionsvorbehalt. Each of these can flip which Veranlagung wins. The
// design-system reference promises out loud to catch exactly that flip
// (`Veranlagung.jsx:60` — "Kippt das (z. B. durch Lohnersatz mit Progressionsvorbehalt),
// sagen wir es dir hier zuerst") — under product ADR-032 that sentence does not ship until
// this module (or a successor) computes what causes the flip.
//
// AN UNSUPPORTED TAX YEAR THROWS. It never falls back to a neighbouring year's coefficients.
// That is `Interview.jsx:28-30`'s hard-wired-2026 defect one level more consequential than
// the working-days table it was found in (#337) — and silence is exactly how it would stay
// invisible (ADR-0021 amendment §1, the existence branch: a check that only validates a
// present value is vacuously satisfied by absence).
//
// SOURCE CAVEAT — stated rather than hidden. This sandbox has no live fetch to the
// Bundesgesetzblatt or the BMF's published Programmablaufplan. The coefficients below are
// reconstructed from trained knowledge of the published §32a EStG formula for each year, and
// cross-checked for internal continuity at every zone boundary (see tarif.test.ts) — a
// fabricated or mistyped table would not, by chance, produce a continuous curve across four
// independent boundary checks per year, so the check is real evidence, not decoration. It is
// still a self-consistency check, not a verification against the primary source. Musti:
// please verify TAX_YEARS against the Bundesgesetzblatt / BMF Programmablaufplan before this
// feeds anything user-facing — flagging on the first zone per your instruction, rather than
// after all three. 2026 is deliberately left unsupported for the same reason: I do not have
// confident recall of its coefficients specifically, and this module's own rule is "throw,
// don't approximate" — so it applies to its own gaps too.
//
// Pure, deterministic, dependency-free (packages/core's charter, see index.ts). No I/O, no
// LLM. Identifiers and messages are English (dev-process language); this module has no
// customer-facing text.

/** Tax years this module has published §32a EStG coefficients for. See the source caveat above. */
export type IncomeTaxYear = 2023 | 2024 | 2025

interface TariffCoefficients {
  /** Grundfreibetrag, in whole euro. zvE at or below this is untaxed. */
  readonly grundfreibetrag: number
  /** Zone 2 (first progressive curve) upper bound and its `y`-formula coefficients. */
  readonly zone2Upper: number
  readonly zone2C1: number
  readonly zone2C2: number
  /** Zone 3 (second progressive curve) upper bound, its `z`-formula coefficients and constant. */
  readonly zone3Upper: number
  readonly zone3C1: number
  readonly zone3C2: number
  readonly zone3Const: number
  /** Zone 4 (linear, 42%) upper bound and its formula. Above it is zone 5 ("Reichensteuer"). */
  readonly zone4Upper: number
  readonly zone4Rate: number
  readonly zone4Sub: number
  /** Zone 5 (linear, 45%) formula, applies for zvE above `zone4Upper`. */
  readonly zone5Rate: number
  readonly zone5Sub: number
}

// §32a Abs. 1 EStG, Grundtarif coefficients per assessment year. See the source caveat above —
// pending Musti's verification against the primary source before this feeds anything
// user-facing. Deliberately does NOT include 2026: no confident recall of its coefficients.
const TAX_YEARS: Readonly<Record<IncomeTaxYear, TariffCoefficients>> = {
  2023: {
    grundfreibetrag: 10908,
    zone2Upper: 15999,
    zone2C1: 979.18,
    zone2C2: 1400,
    zone3Upper: 62809,
    zone3C1: 192.59,
    zone3C2: 2397,
    zone3Const: 966.53,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 9972.98,
    zone5Rate: 0.45,
    zone5Sub: 18307.73,
  },
  2024: {
    grundfreibetrag: 11604,
    zone2Upper: 17005,
    zone2C1: 922.98,
    zone2C2: 1400,
    zone3Upper: 66760,
    zone3C1: 181.19,
    zone3C2: 2397,
    zone3Const: 1025.38,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10602.13,
    zone5Rate: 0.45,
    zone5Sub: 18936.88,
  },
  2025: {
    grundfreibetrag: 12096,
    zone2Upper: 17443,
    zone2C1: 932.3,
    zone2C2: 1400,
    zone3Upper: 68480,
    zone3C1: 176.64,
    zone3C2: 2397,
    zone3Const: 1015.13,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10911.92,
    zone5Rate: 0.45,
    zone5Sub: 19246.67,
  },
}

/** True for a year this module holds coefficients for. Never true for a year it would guess at. */
export function isSupportedIncomeTaxYear(year: number): year is IncomeTaxYear {
  return Object.prototype.hasOwnProperty.call(TAX_YEARS, year)
}

function grundtarif(zvE: number, c: TariffCoefficients): number {
  if (zvE <= c.grundfreibetrag) return 0
  if (zvE <= c.zone2Upper) {
    const y = (zvE - c.grundfreibetrag) / 10000
    return (c.zone2C1 * y + c.zone2C2) * y
  }
  if (zvE <= c.zone3Upper) {
    const z = (zvE - c.zone2Upper) / 10000
    return (c.zone3C1 * z + c.zone3C2) * z + c.zone3Const
  }
  if (zvE <= c.zone4Upper) {
    return c.zone4Rate * zvE - c.zone4Sub
  }
  return c.zone5Rate * zvE - c.zone5Sub
}

/**
 * §32a EStG Grundtarif: the income tax owed on `zuVersteuerndesEinkommen` (zvE) for `year`.
 *
 * Exact for a supported year (layer 1 of the module doc above) — this function does not know
 * or care whether the zvE itself is trustworthy (layer 3). Throws for a negative or
 * non-finite zvE, and throws for any year this module has no coefficients for — it never
 * computes against the nearest supported year.
 */
export function incomeTax(zuVersteuerndesEinkommen: number, year: number): number {
  if (!Number.isFinite(zuVersteuerndesEinkommen)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zuVersteuerndesEinkommen < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }

  // §32a Abs. 1 Satz 6 EStG: zvE is rounded DOWN to the full euro before the formula runs.
  const zvE = Math.floor(zuVersteuerndesEinkommen)
  const tax = grundtarif(zvE, TAX_YEARS[year])
  // Same rounding rule applies to the resulting tax amount.
  return Math.floor(tax)
}

/** Which Veranlagung the comparison recommends. */
export type VeranlagungEmpfehlung = 'zusammenveranlagung' | 'einzelveranlagung'

export interface VeranlagungsvergleichResult {
  /** Combined tax under Zusammenveranlagung (Splittingtarif), in whole euro. */
  readonly zusammenTax: number
  /** Combined tax under Einzelveranlagung (two Grundtarif calculations), in whole euro. */
  readonly einzelTax: number
  /** `zusammenTax - einzelTax`. Zero or negative whenever coupling helps or is neutral. */
  readonly delta: number
  readonly empfehlung: VeranlagungEmpfehlung
}

/**
 * Günstigerprüfung (product ADR-006 / M1): Zusammenveranlagung (Splittingtarif) vs.
 * Einzelveranlagung (two Grundtarif calculations), for a couple's zvE values in `year`.
 *
 * Layer 2 of the module doc above — exact GIVEN `zveA`/`zveB`. This function does not
 * validate that either figure is the couple's real income; that is layer 3, and the
 * caller's responsibility (#321 §A).
 *
 * At equal incomes the Splitting-Vorteil is zero (`delta === 0`) and the recommendation is
 * `'einzelveranlagung'` — coupling two tax years buys nothing there, so nothing recommends
 * it. This is deliberately NOT the same branch as "splitting wins": a fixed/hard-coded
 * `'zusammenveranlagung'` winner would pass every case where splitting genuinely helps and
 * only fail here, which is exactly why this boundary is the module's own red path (N2).
 */
export function veranlagungsvergleich(
  zveA: number,
  zveB: number,
  year: number,
): VeranlagungsvergleichResult {
  if (!Number.isFinite(zveA) || !Number.isFinite(zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zveA < 0 || zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
  // isSupportedIncomeTaxYear is checked by `incomeTax` below; no need to duplicate it here.

  const gemeinsam = Math.floor((zveA + zveB) / 2)
  const zusammenTax = 2 * incomeTax(gemeinsam, year)
  const einzelTax = incomeTax(zveA, year) + incomeTax(zveB, year)
  const delta = zusammenTax - einzelTax

  return {
    zusammenTax,
    einzelTax,
    delta,
    empfehlung: delta < 0 ? 'zusammenveranlagung' : 'einzelveranlagung',
  }
}
