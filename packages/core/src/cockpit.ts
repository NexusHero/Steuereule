// REQ-001 — Cockpit refund estimate as a RANGE, never a point value until everything is
// settled (product ADR-015). The range narrows as open items and conflicts are cleared;
// only with zero open items AND zero open conflicts does it collapse to a point value.
// Pure, deterministic, dependency-free (ultimate-dev-process §3.3/§3.4).

/** Uncertainty added to the range per still-open interview/receipt item, in euro. */
export const UNSICHERHEIT_PRO_ANGABE = 60

/** Uncertainty added per open posten conflict (ADR-008 "± offen"), in euro. */
export const UNSICHERHEIT_PRO_KONFLIKT = 100

export interface Spanne {
  readonly von: number
  readonly bis: number
}

export interface CockpitEingabe {
  /** Base estimate before the range is spread, in euro (>= 0). */
  readonly schaetzung: number
  /** Number of still-open items (>= 0 integer). */
  readonly offeneAngaben: number
  /** Number of open posten conflicts (ADR-008). Defaults to 0. */
  readonly offeneKonflikte?: number
  /** Override for the per-item uncertainty (testing / rule tuning). */
  readonly unsicherheitProAngabe?: number
  /** Override for the per-conflict uncertainty. */
  readonly unsicherheitProKonflikt?: number
}

function pruefeEingabe(e: CockpitEingabe): void {
  if (!Number.isFinite(e.schaetzung) || e.schaetzung < 0) {
    throw new RangeError('schaetzung muss eine nicht-negative endliche Zahl sein')
  }
  if (!Number.isInteger(e.offeneAngaben) || e.offeneAngaben < 0) {
    throw new RangeError('offeneAngaben muss eine nicht-negative ganze Zahl sein')
  }
  const konflikte = e.offeneKonflikte ?? 0
  if (!Number.isInteger(konflikte) || konflikte < 0) {
    throw new RangeError('offeneKonflikte muss eine nicht-negative ganze Zahl sein')
  }
}

/** Compute the Cockpit estimate range from open items and conflicts (ADR-015). */
export function spanneFuerCockpit(e: CockpitEingabe): Spanne {
  pruefeEingabe(e)
  const konflikte = e.offeneKonflikte ?? 0
  const proAngabe = e.unsicherheitProAngabe ?? UNSICHERHEIT_PRO_ANGABE
  const proKonflikt = e.unsicherheitProKonflikt ?? UNSICHERHEIT_PRO_KONFLIKT

  // Point value only when nothing is open (ADR-015).
  if (e.offeneAngaben === 0 && konflikte === 0) {
    return { von: e.schaetzung, bis: e.schaetzung }
  }

  const unsicherheit = e.offeneAngaben * proAngabe + konflikte * proKonflikt
  return {
    von: Math.max(0, e.schaetzung - unsicherheit),
    bis: e.schaetzung + unsicherheit,
  }
}

/** True once the range has collapsed to a single value (nothing open). */
export function istPunktwert(s: Spanne): boolean {
  return s.von === s.bis
}
