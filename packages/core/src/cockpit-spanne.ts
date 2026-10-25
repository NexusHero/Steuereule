// ADR-015/032 — the Cockpit's "Spanne, kein Punktwert" derived from the deterministic
// computation core. `berechnung.ts` folds Posten into a `Berechnungsstand` that is either
// `bestimmt` (a settled sum) or `offen` (naming exactly what blocks a point value). This module
// turns that honest stand into the shape a Cockpit can render, WITHOUT inventing a refund
// estimate: the tax FORMULAS (tariff, Günstigerprüfung, Fünftelregelung, zumutbare Belastung)
// are deliberately not here (ADR-048/032) — the kernel sums *settled* Posten only, so the number
// this module exposes is the settled sum itself, stated as a point value when nothing is open,
// as a bounded range when open items/conflicts widen it, and as an honest "gated" result when a
// declared Einkunftsart 1.0 cannot compute at all (ADR-032: a gated income category cannot be
// widened into a numeric range — it is *unknown*, not uncertain).
//
// This is a NEW module by design (ticket 15): the Angestellte/Cockpit Spannen-Ableitung must not
// edit `berechnung.ts`, which the parallel Vorsorge-Faltung (ticket 16) also imports. Pure,
// deterministic, dependency-free (ADR-0004); imports only from the core's own modules.
import { berechne, type BerechnungsInput, type Berechnungsstand } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit'

/**
 * The honest Cockpit spanne. A discriminated union, never a bare `{from,to}`:
 *  - `bestimmt` — nothing is open/conflicting/gated, the settled sum is a point value (ADR-015).
 *  - `spanne` — open items/conflicts widen the settled sum into a bounded range (ADR-015); a
 *    partial truth stated as a partial truth, never inflated into a guess.
 *  - `gated` — a declared Einkunftsart 1.0 cannot compute is present (ADR-032): no numeric range
 *    is honest, so the result names the gated categories instead of pretending a bound exists.
 */
export type CockpitSpanne =
  | { readonly kind: 'bestimmt'; readonly wert: number }
  | {
      readonly kind: 'spanne'
      readonly von: number
      readonly bis: number
      readonly offenePosten: number
      readonly konflikte: number
      /** ADR-021 — Anzahl der übernommenen, noch unbestätigten Posten (ruhiger Ton, kein Konflikt). */
      readonly unbestaetigte: number
      /** ADR-021 — Einnahmen-Summe der unbestätigten Posten (trägt die Spanne als Unsicherheit). */
      readonly unbestaetigteSumme: number
    }
  | { readonly kind: 'gated'; readonly summe: number; readonly gegated: readonly Einkunftsart[] }

/** The count-based inputs a caller (the Cockpit API) holds before any Posten objects exist. */
export interface CockpitSpanneEingaben {
  /** The settled income-Posten sum (partial truth when anything is open). */
  readonly summe: number
  /** Still-open required line items (>= 0 integer). */
  readonly offenePosten: number
  /** Open posten conflicts (ADR-008), a count (>= 0 integer). */
  readonly konflikte: number
  /** Declared-but-uncomputable Einkunftsarten (ADR-028/032/033). */
  readonly gegated: readonly Einkunftsart[]
  /** ADR-021 — Anzahl der übernommenen, noch unbestätigten Posten. */
  readonly unbestaetigte?: number
  /** ADR-021 — Einnahmen-Summe der unbestätigten Posten. */
  readonly unbestaetigteSumme?: number
}

function spanneAusZahlen(
  summe: number,
  offenePosten: number,
  konflikte: number,
  gegated: readonly Einkunftsart[],
  unbestaetigte = 0,
  unbestaetigteSumme = 0,
): CockpitSpanne {
  // Gated first: a declared-but-uncomputable Einkunftsart (Gewerbe, Krypto-Kapital, Verkauf-
  // Vermietung) means the range's own bound is unknowable, so it is named rather than faked
  // (ADR-032). The settled sum is still carried so a partial truth is not discarded.
  if (gegated.length > 0) return { kind: 'gated', summe, gegated }
  if (offenePosten === 0 && konflikte === 0 && unbestaetigte === 0) return { kind: 'bestimmt', wert: summe }

  // ADR-021: unbestätigte Posten zählen in die Spanne — ihre Summe ist die Unsicherheit, die sie
  // beitragen (ruhig benannt, nie ein Konflikt).
  const uncertainty = offenePosten * UNCERTAINTY_PER_ITEM + konflikte * UNCERTAINTY_PER_CONFLICT + unbestaetigteSumme
  return {
    kind: 'spanne',
    von: Math.max(0, summe - uncertainty),
    bis: summe + uncertainty,
    offenePosten,
    konflikte,
    unbestaetigte,
    unbestaetigteSumme,
  }
}

/**
 * Derive the Cockpit spanne from a `Berechnungsstand` (the result of `berechne`). The
 * uncertainty per open item/conflict reuses `cockpit.ts`'s constants so there is exactly one
 * source of truth for the widening rule; only the INPUT has changed — from a placeholder
 * `baseEstimate` to the kernel's own settled `summe`.
 */
export function cockpitSpanne(stand: Berechnungsstand): CockpitSpanne {
  // Union with ticket 16: `berechne` now returns three buckets (einnahmen/vorsorgeaufwand/
  // anrechnung), never a single sum. The Cockpit spanne derives from the EINNAHMEN bucket —
  // vorsorgeaufwand/anrechnung stay separate honest buckets whose aggregation is Phase-2
  // formula work, deliberately not subtracted here.
  if (stand.kind === 'bestimmt') return { kind: 'bestimmt', wert: stand.einnahmen }
  return spanneAusZahlen(
    stand.einnahmen,
    stand.offenePosten,
    stand.konflikte,
    stand.gegated,
    stand.unbestaetigte,
    stand.unbestaetigteSumme,
  )
}

/**
 * The Cockpit API's own entry point: derive the spanne from the settled sum + the honest counts,
 * WITHOUT requiring `PostenKonflikt` objects to be fabricated (a conflict count is all `berechne`
 * itself reads out of its `konflikte` array). Kept beside `cockpitSpanne` so the range rule lives
 * in exactly one place.
 */
export function cockpitSpanneAusEingaben(eingaben: CockpitSpanneEingaben): CockpitSpanne {
  return spanneAusZahlen(
    eingaben.summe,
    eingaben.offenePosten,
    eingaben.konflikte,
    eingaben.gegated,
    eingaben.unbestaetigte ?? 0,
    eingaben.unbestaetigteSumme ?? 0,
  )
}

/** Convenience: fold a full `BerechnungsInput` through `berechne`, then derive the spanne. */
export function spanneAusBerechnung(input: BerechnungsInput): CockpitSpanne {
  return cockpitSpanne(berechne(input))
}
