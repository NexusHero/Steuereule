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
//  2. `veranlagungsartenvergleich`'s `einzel`/`zusammen`/`delta` triple is EXACT GIVEN two zvE
//     values — integer/float arithmetic over two calls to `incomeTax`, no approximation
//     anywhere in the path: `2 × incomeTax(⌊(zvE_A + zvE_B) / 2⌋, year)` against
//     `incomeTax(zvE_A, year) + incomeTax(zvE_B, year)`. What this layer does NOT claim is a
//     verdict — see ADR-0034, decision 3/4 below.
//  3. NEITHER OF THE ABOVE SAYS ANYTHING ABOUT THE ACCURACY OF THE zvE THAT GOES IN, and this
//     module deliberately does not try to supply one — #321 §A leaves "which figure" an open
//     stakeholder call. An exact tariff over a coarse input reads as authoritative PRECISELY
//     BECAUSE it is precise. A caller may render this module's output as a recommendation
//     only once #321 §A's income-figure question is settled AND Produkt-ADR-032 §1's origin
//     requirement (HerkunftsChip: Regel + Rechenweg) is met on screen.
//
// EXPLICITLY NOT COMPUTED HERE, and this is a finding, not a caveat: Solidaritätszuschlag,
// Kirchensteuer, Progressionsvorbehalt. Each of these can flip which Veranlagung wins. The
// design-system reference promises out loud to catch exactly that flip
// (`Veranlagung.jsx:60` — "Kippt das (z. B. durch Lohnersatz mit Progressionsvorbehalt),
// sagen wir es dir hier zuerst") — under Produkt-ADR-032 that sentence does not ship until
// this module (or a successor) computes what causes the flip.
//
// F3 (Musti's PR #340 review) IS SETTLED — docs/adr/0034-veranlagungsartenvergleich-returns-a-
// bounded-comparison.md. `veranlagungsartenvergleich` (renamed from `veranlagungsvergleich`;
// "Günstigerprüfung" is reserved for Produkt-ADR-032's § 32d Abs. 6 Abgeltungsteuer-vs-
// personal-rate comparison and is never used for this § 26 assessment-type comparison) returns
// a discriminated union keyed on `aussage`. `empfehlung` survives only inside the
// `aussage: 'eindeutig'` variant — not optional, not nullable, not a top-level field beside an
// ignorable confidence flag — so a caller that wants the verdict must read `aussage` first and
// the compiler refuses the shortcut (see `Veranlagungsartenvergleich` below; the same
// unrepresentable-to-skip instinct as ADR-0031 §4 as built in #341). `unschaerfe` carries the
// margin, computed from `einzel`/`zusammen` — Soli and Kirchensteuer are surcharges on assessed
// tax and so are boundable from those two amounts, but Progressionsvorbehalt is NOT boundable
// from zvE alone and this module takes no Lohnersatzleistungen input, so `unschaerfe` is
// `{ kind: 'unbestimmt' }` unconditionally today and `aussage` can never be `'eindeutig'` — see
// the function doc below. That is ADR-0034's consequence working, not a defect: "we cannot say"
// is the honest answer until Progressionsvorbehalt is an input.
//
// AN UNSUPPORTED TAX YEAR THROWS. It never falls back to a neighbouring year's coefficients.
// That is `Interview.jsx:28-30`'s hard-wired-2026 defect one level more consequential than
// the working-days table it was found in (#337) — and silence is exactly how it would stay
// invisible (ADR-0021 amendment §1, the existence branch: a check that only validates a
// present value is vacuously satisfied by absence).
//
// SOURCE CAVEAT — stated rather than hidden. This sandbox has no live fetch to the
// Bundesgesetzblatt or the BMF's published Programmablaufplan (reconfirmed for PR #340's
// review round: CONNECT to www.bmf-steuerrechner.de and www.gesetze-im-internet.de both 403 at
// the proxy). The coefficients below are reconstructed from trained knowledge of the published
// §32a EStG formula for each year, and cross-checked for internal continuity at every zone
// boundary (see tarif.test.ts) — a fabricated or mistyped table would not, by chance, produce a
// continuous curve across three independent boundary checks per year, so the check is real
// evidence, not decoration. It is still a self-consistency check, not a verification against
// the primary source (F1, PR #340 review: replacing one year's whole table with another year's
// verbatim and rederiving every test literal from it left the suite 36/36 green — continuity
// braces coefficients against each other, not against reality). Musti: please verify TAX_YEARS
// against the Bundesgesetzblatt / BMF Programmablaufplan before this feeds anything
// user-facing — flagging on the first zone per your instruction, rather than after all three.
// 2026 is deliberately left unsupported for the same reason: I do not have confident recall of
// its coefficients specifically, and this module's own rule is "throw, don't approximate" — so
// it applies to its own gaps too.
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

/**
 * True for a year this module holds coefficients for. Never true for a year it would guess at.
 *
 * `Number.isInteger` is required, not decorative (F6, PR #340 review): `TAX_YEARS`' keys are
 * object-property strings, so `hasOwnProperty` alone treats the *string* `'2024'` as a
 * supported year too — exactly the untyped boundary this existence check exists to hold, since
 * `year` reaches this module from a path/query parameter (R1-R4) as a string.
 */
export function isSupportedIncomeTaxYear(year: number): year is IncomeTaxYear {
  return Number.isInteger(year) && Object.prototype.hasOwnProperty.call(TAX_YEARS, year)
}

/**
 * The zvE boundaries between zone 2/3/4/5 for a supported year, ascending:
 * `[zone2Upper, zone3Upper, zone4Upper]`.
 *
 * Exported so a continuity test asks this module where its own edges are (F7, PR #340 review),
 * rather than duplicating them in a second, hand-maintained map that can silently stop tracking
 * `TAX_YEARS` — which is precisely what happened during F1's investigation: shifting a year's
 * `zone2Upper` moved the actual boundary while a hard-coded fixture kept checking the old one.
 */
export function zoneBoundaries(year: IncomeTaxYear): readonly [number, number, number] {
  const c = TAX_YEARS[year]
  return [c.zone2Upper, c.zone3Upper, c.zone4Upper]
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

/**
 * ADR-0034 decision 3: the bound on how far the three excluded factors (Solidaritätszuschlag,
 * Kirchensteuer, Progressionsvorbehalt) could move `delta` away from what
 * `veranlagungsartenvergleich` computed.
 *
 * `'bestimmt'` (a computed `obergrenze`, in whole euro) is reachable only once Soli/Kirchensteuer
 * are computed AND Progressionsvorbehalt is bounded — the latter needs a Lohnersatzleistungen
 * input this module does not (yet) accept, so `'bestimmt'` is currently unreachable. A bound that
 * ignores an unboundable factor is not a bound; that is why the two are not tracked separately
 * and one absent input collapses the whole value to `'unbestimmt'`, never a partial figure.
 */
export type Unschaerfe =
  | { readonly kind: 'bestimmt'; readonly obergrenze: number }
  | { readonly kind: 'unbestimmt'; readonly grund: 'progressionsvorbehalt-nicht-eingegeben' }

/**
 * ADR-0034 decision 2: the result of `veranlagungsartenvergleich`, discriminated on `aussage` so
 * a caller cannot read `empfehlung` without first checking whether the module has earned the
 * right to give one. `empfehlung` exists ONLY on the `'eindeutig'` variant — not optional, not
 * nullable, not a top-level field beside an ignorable confidence flag. The compiler refuses the
 * shortcut; see `tarif.test.ts`'s `@ts-expect-error` proof.
 *
 * What a caller is entitled to conclude from each field (ADR-0034 §4, verbatim):
 *
 * | From | Entitled to conclude | **Not** entitled to conclude |
 * |---|---|---|
 * | `einzel`, `zusammen` | the § 32a tariff on the two zvE handed in, exact to the euro | that the zvE handed in is the right figure — accuracy layer 3 is still open (#321 § A) |
 * | `delta` | the exact tariff difference **for those zvE** | the difference in what the user actually pays |
 * | `aussage: 'eindeutig'` + `empfehlung` | this Veranlagung wins **by more than the excluded factors could move it** | that it wins *by* `delta` |
 * | `aussage: 'zu-knapp'` | the tariff difference is inside the noise floor of what we do not compute | that the two are equal, or that it does not matter |
 * | `aussage: 'unbestimmt'` | we cannot bound the error at all | anything whatsoever about which wins |
 *
 * `delta` (= `zusammen - einzel`) is negative whenever coupling genuinely helps, but is NOT
 * merely zero at exact-equal incomes — it CAN BE POSITIVE in a narrow band near them (F2, PR
 * #340 review, preserved across the ADR-0034 rename): each side of `einzel` is floored
 * independently (§32a Abs. 1 Satz 6 EStG) before summing, while `zusammen` floors the averaged,
 * then doubled, amount once — so a sub-euro Splitting-Vorteil can be inverted by rounding. E.g.
 * `veranlagungsartenvergleich(11931, 12017, 2024).delta === 1`. Not a defect: the assessed
 * (floored) amounts are what the statute actually taxes.
 */
export type Veranlagungsartenvergleich =
  | {
      readonly aussage: 'eindeutig'
      readonly empfehlung: 'einzel' | 'zusammen'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
    }
  | {
      readonly aussage: 'zu-knapp'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
    }
  | {
      readonly aussage: 'unbestimmt'
      readonly einzel: number
      readonly zusammen: number
      readonly delta: number
      readonly unschaerfe: Unschaerfe
    }

/**
 * Veranlagungsartenvergleich (Produkt-ADR-006 / M1, module contract ADR-0034): Zusammenveranlagung
 * (Splittingtarif) vs. Einzelveranlagung (two Grundtarif calculations), for a couple's zvE values
 * in `year`. Named "veranlagungsartenvergleich" — NOT "Günstigerprüfung", which is reserved
 * (ADR-0034 decision 1) for Produkt-ADR-032's § 32d Abs. 6 Abgeltungsteuer-vs-personal-rate test
 * on Kapitalerträge, a different comparison entirely.
 *
 * `einzel`/`zusammen`/`delta` are layer 2 of the module doc above — exact GIVEN `zveA`/`zveB`.
 * This function does not validate that either figure is the couple's real income; that is layer
 * 3, and the caller's responsibility (#321 §A).
 *
 * `aussage` is ALWAYS `'unbestimmt'` today (ADR-0034's stated consequence, not a defect):
 * Solidaritätszuschlag and Kirchensteuer are surcharges on assessed tax and so are boundable from
 * `einzel`/`zusammen` alone, but Progressionsvorbehalt is not boundable from zvE alone, and this
 * function takes no Lohnersatzleistungen input to bound it with. One unboundable excluded factor
 * makes the whole margin `unbestimmt`, so `aussage` can never reach `'eindeutig'` or `'zu-knapp'`
 * — both require `unschaerfe.kind === 'bestimmt'` — until a future input supplies
 * Progressionsvorbehalt. The `'eindeutig'`/`'zu-knapp'` variants exist in the type so that day
 * does not require another breaking change to this contract.
 */
export function veranlagungsartenvergleich(
  zveA: number,
  zveB: number,
  year: number,
): Veranlagungsartenvergleich {
  if (!Number.isFinite(zveA) || !Number.isFinite(zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zveA < 0 || zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
  // isSupportedIncomeTaxYear is checked by `incomeTax` below; no need to duplicate it here.

  const gemeinsam = Math.floor((zveA + zveB) / 2)
  const zusammen = 2 * incomeTax(gemeinsam, year)
  const einzel = incomeTax(zveA, year) + incomeTax(zveB, year)
  const delta = zusammen - einzel

  return {
    aussage: 'unbestimmt',
    einzel,
    zusammen,
    delta,
    unschaerfe: { kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' },
  }
}
