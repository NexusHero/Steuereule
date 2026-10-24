// ADR-006 — a Steuerjahr belongs to ONE person; every person owns their own Steuerjahre.
// Zusammenveranlagung links two Steuerjahre of the SAME calendar year (a coupling of two
// persons' years); the link produces a shared filing, but Belege and Posten stay
// person-bound. Decoupling (Trennung, switch to Einzelveranlagung) dissolves only the
// link, never data. UI-free, no I/O (ADR-0004). German tax-domain nouns as identifiers
// (same reasoning as `veranlagungsartenvergleich` — ADR-0034).
import type { Einkunftsart } from './einkunftsarten.js'

/** The coupling state of a Steuerjahr (ADR-006). */
export type Veranlagung =
  | { readonly kind: 'einzeln' }
  | { readonly kind: 'zusammen'; readonly partnerSteuerjahrId: string }

export interface Steuerjahr {
  readonly id: string
  /**
   * The owning person's userId — the codebase's single scoping key (ADR-0007/0012:
   * a guest session or a real account both flow through one seam). ADR-006's "Person"
   * is this id. Belege/Posten of this Steuerjahr stay bound to this id, even when coupled.
   */
  readonly userId: string
  readonly jahr: number
  readonly einkunftsarten: readonly Einkunftsart[]
  readonly veranlagung: Veranlagung
}

/**
 * Links two single-veranlagung Steuerjahre into a Zusammenveranlagung (ADR-006). Throws
 * on an invalid coupling — same person, different calendar years, or either side already
 * coupled — because this function is the ONLY way to form a link, and an invalid link is
 * a data-corruption risk, not a recoverable user error.
 */
export function kopple(a: Steuerjahr, b: Steuerjahr): readonly [Steuerjahr, Steuerjahr] {
  if (a.userId === b.userId) {
    throw new Error('kopple: a Steuerjahr cannot be coupled with itself (same userId)')
  }
  if (a.jahr !== b.jahr) {
    throw new Error('kopple: Zusammenveranlagung links two Steuerjahre of the SAME calendar year')
  }
  if (a.veranlagung.kind !== 'einzeln' || b.veranlagung.kind !== 'einzeln') {
    throw new Error('kopple: both Steuerjahre must be einzeln before coupling')
  }
  return [
    { ...a, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: b.id } },
    { ...b, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: a.id } },
  ]
}

/**
 * Dissolves only the link (ADR-006: "Entkopplung löst nur die Kopplung, zerstört keine
 * Daten"). The Steuerjahr keeps its id, personId, jahr and einkunftsarten — only
 * `veranlagung` returns to 'einzeln'. Throws when nothing is coupled: decoupling a
 * single Steuerjahr would be a no-op dressed as a decision.
 */
export function entkopple(s: Steuerjahr): Steuerjahr {
  if (s.veranlagung.kind !== 'zusammen') {
    throw new Error('entkopple: a Steuerjahr that is not coupled cannot be decoupled')
  }
  return { ...s, veranlagung: { kind: 'einzeln' } }
}
