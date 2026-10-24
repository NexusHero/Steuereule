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

export interface BelegDaten {
  readonly id: string
  /** The owning person's userId (ADR-006/0007 — Belege stay user-bound, even when coupled). */
  readonly userId: string
  /** Original filename / storage key. Sensitive (PII can live in filenames) — encrypted at rest. */
  readonly dateiname: string
  /** Invoice date, ISO yyyy-mm-dd. */
  readonly belegdatum?: string
  /** Payment date, ISO yyyy-mm-dd — § 11 Zufluss fixes the year, not the invoice date. */
  readonly zahlungsdatum?: string
  /** The CONFIRMED year (a tap has happened). `null` while not confirmed. */
  readonly steuerjahr: number | null
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
    if (vorschlag !== null && vorschlag.steuerjahr !== daten.steuerjahr) {
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
  return { ...daten, steuerjahr }
}
