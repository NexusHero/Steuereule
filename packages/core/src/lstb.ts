// ADR-036 (Scan-Fallback) — the LStB (Lohnsteuerbescheinigung) guided mask for the
// Angestellte-Vertikale (ticket 08). The user transcribes the printed figures field by field,
// in the paper's own order, while the photo stays stored as a Beleg (ADR-007). Scan/OCR is
// deliberately OUT of scope here (ADR-045, a later slice) — this module is the DATA interface and
// the honest states only, not extraction.
//
// The honest states are the point of this module (ADR-032/ADR-0032: no silent guess). A field is
// one of `erfasst` (a value was typed), `offen` (not yet reached) or `unklar` (the user looked at
// the paper and could NOT read it — "unlesbar", the honest fallback ADR-036 names). The derived
// `LstbZustand` is a pure function of these facts, recomputed on every read (ADR-014/048
// determinism boundary), never stored — same instinct as Beleg's `zuordnungAusDaten`.
//
// The three fields are the LStB's own printed figures: Bruttoarbeitslohn (Zeile 3),
// einbehaltene Lohnsteuer (Zeile 4) and the Arbeitnehmer-Anteil der SV-Beiträge (Zeilen 22/23
// zusammengefasst). Werbungskosten are NOT printed on the LStB — they live in the Angestellte
// fold (angestellte.ts), fed by the Arbeitstage-Rechner and the Lebenslagen catalogue. Pure,
// deterministic, dependency-free (ADR-0004).

/** The three LStB-printed fields the guided mask captures. */
export type LstbFeldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

/** One field's honest capture state. `wert` is whole euros (>= 0) when `erfasst`. */
export type LstbFeldZustand =
  | { readonly kind: 'erfasst'; readonly wert: number }
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }

export interface LstbDaten {
  readonly bruttoarbeitslohn: LstbFeldZustand
  readonly lohnsteuer: LstbFeldZustand
  readonly sozialversicherung: LstbFeldZustand
}

/** The guided mask's starting point — every field open, nothing guessed. */
export const LEERES_LSTB: LstbDaten = {
  bruttoarbeitslohn: { kind: 'offen' },
  lohnsteuer: { kind: 'offen' },
  sozialversicherung: { kind: 'offen' },
}

/**
 * A value entered into the mask must be a non-negative whole-euro amount. The mask stores whole
 * euros only — the LStB's cents are rounded away at entry (the fold in angestellte.ts works in
 * whole euros, matching berechnung.ts's Posten contract).
 */
export function istGueltigerBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

/**
 * The one setter — `setzeFeld(daten, feld, zustand)` returns a copy with that field replaced.
 * Throws when `zustand.kind === 'erfasst'` and the value is not a valid amount, so an invalid
 * amount can never enter the mask (defense in depth: the DTO validates too, this is the core's
 * own invariant).
 */
export function setzeLstbFeld(daten: LstbDaten, feld: LstbFeldId, zustand: LstbFeldZustand): LstbDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerBetrag(zustand.wert)) {
    throw new RangeError(`lstb: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

/** A structural contradiction between two erfasst figures (ADR-008: named, never silently fixed). */
export type LstbWiderspruch =
  | { readonly art: 'lohnsteuer-uebersteigt-brutto'; readonly lohnsteuer: number; readonly bruttoarbeitslohn: number }
  | {
      readonly art: 'sozialversicherung-uebersteigt-brutto'
      readonly sozialversicherung: number
      readonly bruttoarbeitslohn: number
    }

/**
 * The derived state of the mask. A pure fold of the three field states, with an explicit
 * precedence:
 *   - any field `offen` or `unklar` → `unvollstaendig` (naming which is which — `unklar` is the
 *     ADR-036 "unlesbar" fallback, `offen` is simply "not reached yet");
 *   - all `erfasst` but one figure exceeds the Bruttoarbeitslohn → `widerspruch` (ADR-008, a
 *     visible contradiction, never a silent fix);
 *   - all `erfasst` and consistent → `vollstaendig`, carrying the three values out.
 */
export type LstbZustand =
  | { readonly kind: 'unvollstaendig'; readonly offen: readonly LstbFeldId[]; readonly unklar: readonly LstbFeldId[] }
  | { readonly kind: 'widerspruch'; readonly widersprueche: readonly LstbWiderspruch[] }
  | {
      readonly kind: 'vollstaendig'
      readonly bruttoarbeitslohn: number
      readonly lohnsteuer: number
      readonly sozialversicherung: number
    }

const FELDER: readonly LstbFeldId[] = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

function widersprueche(daten: LstbDaten): readonly LstbWiderspruch[] {
  // Reachable only when all three are `erfasst` (the caller checks that first) — the casts are
  // guarded by that precondition, same instinct as `stepFor` in interview.ts.
  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert

  const result: LstbWiderspruch[] = []
  if (lohnsteuer > brutto) {
    result.push({ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer, bruttoarbeitslohn: brutto })
  }
  if (sozialversicherung > brutto) {
    result.push({ art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung, bruttoarbeitslohn: brutto })
  }
  return result
}

export function lstbZustand(daten: LstbDaten): LstbZustand {
  const offen: LstbFeldId[] = []
  const unklar: LstbFeldId[] = []
  let alleErfasst = true

  for (const feld of FELDER) {
    const zustand = daten[feld]
    if (zustand.kind === 'offen') {
      alleErfasst = false
      offen.push(feld)
    } else if (zustand.kind === 'unklar') {
      alleErfasst = false
      unklar.push(feld)
    }
  }

  if (!alleErfasst) return { kind: 'unvollstaendig', offen, unklar }

  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert
  const widerspr = widersprueche(daten)
  if (widerspr.length > 0) return { kind: 'widerspruch', widersprueche: widerspr }

  return { kind: 'vollstaendig', bruttoarbeitslohn: brutto, lohnsteuer, sozialversicherung }
}

// --------------------------------------------------------------------------------------------
// Persistence encoding — the one place the "offen / unklar / erfasst" states map to a stored
// string, so the API repository and its tests cannot drift from each other (ADR-0033's one-rule
// instinct). The stored column is a nullable string: `null` is `offen`, the reserved marker is
// `unklar`, any other string is a decimal amount (`erfasst`). The marker can never collide with a
// real value because erfasst values are non-negative integers and the marker is not a number.
// --------------------------------------------------------------------------------------------

/** The reserved stored value for a field the user looked at and could not read ("unklar"). */
export const LSTB_UNKLAR = 'unklar'

/** A field state → its stored string (`null` for `offen`). */
export function serialisiereLstbFeld(zustand: LstbFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return LSTB_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

/**
 * A stored string → its field state. A value that is neither `null`, the unklar marker, nor a
 * valid amount is corruption (the column has never written anything else) — throw, don't guess.
 */
export function deserialisiereLstbFeld(value: string | null): LstbFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === LSTB_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerBetrag(wert)) {
    throw new Error(`lstb: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return { kind: 'erfasst', wert }
}
