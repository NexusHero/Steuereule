// ADR-007/008 — the Beleg-Posteingang (receipt inbox). A Beleg lands UNBOUND (no year):
// the user photographs a receipt at the moment of receipt, not while filing (ADR-007).
// Extraction SUGGESTS a Steuerjahr — payment date over invoice date (§ 11 EStG
// Zufluss/Abfluss: the payment date fixes the year, not the invoice date); a tap confirms.
// Assigning a year that contradicts the date-derived suggestion yields a visible KONFLIKT
// state, never a silent overwrite (ADR-008). Scan/OCR is OUT of scope here (ADR-036/045,
// later slices) — this is the DATA interface only: dates, filename, assignment state.
// Pure, no I/O (ADR-0004).
//
// The Zuordnung state is DERIVED from the persisted facts, never stored — same instinct
// as TaxYear's estimate range being recomputed rather than persisted (ADR-014/048): the
// suggestion is a pure function of the dates, so a stored copy could only drift.
import type { Belegart } from './belegart.js'

export interface BelegDaten {
  readonly id: string
  /** The owning person's userId (ADR-006/0007 — Belege stay user-bound, even when coupled). */
  readonly userId: string
  /** Original filename / storage key. Sensitive (PII can live in filenames) — encrypted at rest. */
  readonly dateiname: string
  /** The document type (ADR-029 — Lohnausweis/Quellensteuer/PK/3a/KK/Zulagen/…). Absent = the
   *  pre-CH generic receipt; the CH vertical and the Angestellten vertical share one vocabulary
   *  (belegart.ts), and the Zuordnung semantics below are identical for every art. */
  readonly art?: Belegart
  /** Invoice date, ISO yyyy-mm-dd. */
  readonly belegdatum?: string
  /** Payment date, ISO yyyy-mm-dd — § 11 Zufluss fixes the year, not the invoice date. */
  readonly zahlungsdatum?: string
  /** The CONFIRMED year (a tap has happened). `null` while not confirmed. */
  readonly steuerjahr: number | null
  /** ADR-008 "bei meinem Jahr bleiben": whether the user explicitly dismissed the date-derived
   *  suggestion to keep their own confirmed year. A persisted fact (not the derived state), so
   *  `zuordnungAusDaten` can resolve the `konflikt` to `zugeordnet` without silently
   *  overwriting the dates that still contradict the year. */
  readonly vorschlagVerworfen: boolean
}

export type VorschlagsHerkunft = 'zahlungsdatum' | 'belegdatum'

export interface SteuerjahrVorschlag {
  readonly steuerjahr: number
  readonly herkunft: VorschlagsHerkunft
}

function jahrAusDatum(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

/**
 * ADR-007 — the year-suggestion rule. § 11 EStG Zufluss/Abfluss: the payment date fixes
 * the year, not the invoice date — so prefer `zahlungsdatum`; fall back to `belegdatum`
 * only when there is no payment date; no dates → no suggestion (stays ungebunden). The
 * `herkunft` records which date the rule actually used ("Regel: Zahlungsdatum" chip).
 */
export function steuerjahrVorschlag(daten: BelegDaten): SteuerjahrVorschlag | null {
  if (daten.zahlungsdatum !== undefined) {
    const jahr = jahrAusDatum(daten.zahlungsdatum)
    if (jahr !== null) return { steuerjahr: jahr, herkunft: 'zahlungsdatum' }
  }
  if (daten.belegdatum !== undefined) {
    const jahr = jahrAusDatum(daten.belegdatum)
    if (jahr !== null) return { steuerjahr: jahr, herkunft: 'belegdatum' }
  }
  return null
}

/**
 * The visible Zuordnung state, derived from the facts. `konflikt` is the honest state
 * where a CONFIRMED year and the date-derived suggestion disagree — both years are kept
 * visible (ADR-008), and nothing is silently overwritten.
 */
export type BelegZuordnung =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly vorschlag: SteuerjahrVorschlag }
  | { readonly kind: 'zugeordnet'; readonly steuerjahr: number }
  | { readonly kind: 'konflikt'; readonly zugeordnet: number; readonly vorschlag: SteuerjahrVorschlag }

export function zuordnungAusDaten(daten: BelegDaten): BelegZuordnung {
  const vorschlag = steuerjahrVorschlag(daten)
  if (daten.steuerjahr !== null) {
    // ADR-008: a confirmed year that contradicts the date-derived suggestion is a visible
    // `konflikt` — unless the user has explicitly dismissed the suggestion ("bei meinem Jahr
    // bleiben"), which resolves it to `zugeordnet` on their own confirmed year.
    if (!daten.vorschlagVerworfen && vorschlag !== null && vorschlag.steuerjahr !== daten.steuerjahr) {
      return { kind: 'konflikt', zugeordnet: daten.steuerjahr, vorschlag }
    }
    return { kind: 'zugeordnet', steuerjahr: daten.steuerjahr }
  }
  if (vorschlag !== null) return { kind: 'vorgeschlagen', vorschlag }
  return { kind: 'ungebunden' }
}

/**
 * ADR-007 — the one assignment operation (tap or manual). Sets the confirmed year. The
 * CONFLICT is not a branch here: assigning a year that contradicts the dates simply
 * persists the confirmed year, and `zuordnungAusDaten` then reports `konflikt` — visible,
 * not a silent overwrite. Throws on a non-integer year (a Steuerjahr is a calendar year,
 * not a free-form number).
 */
export function ordneZu(daten: BelegDaten, steuerjahr: number): BelegDaten {
  if (!Number.isInteger(steuerjahr)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  // A fresh explicit assignment re-opens the decision: it clears any prior dismissal of the
  // suggestion, so the derived state re-derives the conflict honestly from the new year.
  return { ...daten, steuerjahr, vorschlagVerworfen: false }
}

/**
 * ADR-008 — the "bei meinem Jahr bleiben" resolution of a `konflikt`. Persists the fact that
 * the user dismissed the date-derived suggestion, keeping their own confirmed year. Only
 * meaningful while a confirmed year contradicts the suggestion (the UI offers it in exactly
 * that state); like `ordneZu` it is a pure fact-setter — the resolution is *derived* on the
 * next read, never a stored Zuordnung state.
 */
export function verwerfeVorschlag(daten: BelegDaten): BelegDaten {
  return { ...daten, vorschlagVerworfen: true }
}
