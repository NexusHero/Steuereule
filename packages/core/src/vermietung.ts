// Vermietung-Vertikale (ticket 10.6, product ADR-033 — Vermietung EINFACH; Verkauf/möbliert
// bleibt Gate). Three things live here:
// (1) the Vermietung-Einordnung — the interview answer `vermietung-art` ('Einfach' | 'Mehrere' |
//     'Verkauf oder möbliert', interview.ts VERMIETUNG_ART_VALUES) mapped onto what it MEANS:
//     Einfach/Mehrere are computable (ganzjährig vermietete Objekte, je Objekt eine Anlage V),
//     Verkauf/möbliert-auf-Zeit stays gated (product ADR-033 — the boundary is named honestly,
//     never silently widened), unbekannt is never guessed;
// (2) the guided-mask data interface for ONE Vermietungsobjekt — four captured facts
//     (Mieteinnahmen, Anschaffungskosten, Baujahr, Werbungskosten), each honestly
//     erfasst/offen/unklar (same honesty state machine as lstb.ts/rente.ts/kapital.ts);
// (3) the per-object facts and the fold into the deterministic core: the Mieteinnahmen become an
//     Einnahme-Posten with Herkunft, the Werbungskosten and the lineare AfA (§ 7 Abs. 4 Satz 1
//     EStG: 2,5 % / 2 % / 3 % nach Baujahr) are reported SEPARATELY — never subtracted here
//     (the net calc is the tax-formula slice's work, the same "partial truth stated as a
//     partial truth" honesty as angestellte.ts's sonderausgaben). An amount is never fabricated:
//     a missing required field or a Baujahr outside the statutory rule is OFFEN, never a guessed
//     zero (product ADR-032 honesty).
//
// Pure, no I/O (ADR-0004). The AfA-Satz comes FROM the statute (§ 7 Abs. 4 Satz 1 EStG — a cited
// rule, not invented arithmetic).
import { berechne, type Posten } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'

// --- Vermietung-Einordnung (product ADR-033) --------------------------------------------------

/**
 * The three `vermietung-art` interview answers (interview.ts VERMIETUNG_ART_VALUES), the closed
 * vocabulary this module reasons over. German domain terms, byte-equal to the persisted answer
 * values (ADR-0033 citation form).
 */
export type VermietungArtAntwort = 'Einfach' | 'Mehrere' | 'Verkauf oder möbliert'

/** Canonical order — `VERMIETUNG_ART_ANTWORTEN` returned in this order, a deterministic array. */
export const VERMIETUNG_ART_ANTWORTEN: readonly VermietungArtAntwort[] = [
  'Einfach',
  'Mehrere',
  'Verkauf oder möbliert',
]

/** Total over `string`: is `value` a declared vermietung-art answer? */
export function istVermietungArtAntwort(value: string): value is VermietungArtAntwort {
  return (VERMIETUNG_ART_ANTWORTEN as readonly string[]).includes(value)
}

/**
 * What the vermietung-art answer MEANS for 1.0 (product ADR-033, ticket 10.6 AC 3):
 *
 *   - `einfach` / `mehrere` — computable: ganzjährig vermietete Objekte, je Objekt eine
 *     Anlage V, lineare AfA. Both ship; the count differs, the math is the same per object.
 *   - `verkauf-oder-moebliert` — GATED in 1.0 (ADR-033: Verkauf = privates
 *     Veräußerungsgeschäft mit Fristen, möbliert-auf-Zeit = eigene Abgrenzung). The gate is
 *     the honest statement, never a half feature. `gatedEinkunftsarten` already gates the
 *     declared `Vermietung` Einkunftsart for this answer; this Einordnung names the gate for
 *     the screen.
 *   - `unbekannt` — the answer is missing: nothing is guessed.
 */
export type VermietungEinordnung =
  | { readonly kind: 'einfach' }
  | { readonly kind: 'mehrere' }
  | { readonly kind: 'verkauf-oder-moebliert' }
  | { readonly kind: 'unbekannt' }

/** The `vermietung-art` answer (or its absence) → the Vermietung-Einordnung. Never guesses. */
export function ordneVermietungEin(vermietungArt: string | undefined): VermietungEinordnung {
  switch (vermietungArt) {
    case 'Einfach':
      return { kind: 'einfach' }
    case 'Mehrere':
      return { kind: 'mehrere' }
    case 'Verkauf oder möbliert':
      return { kind: 'verkauf-oder-moebliert' }
    default:
      return { kind: 'unbekannt' }
  }
}

/** Computable 1.0 covers only the ganzjährig-vermietete cases (ADR-033). */
export function istVermietungBerechenbar(einordnung: VermietungEinordnung): boolean {
  return einordnung.kind === 'einfach' || einordnung.kind === 'mehrere'
}

// --- Lineare AfA (§ 7 Abs. 4 Satz 1 EStG) -----------------------------------------------------

/**
 * § 7 Abs. 4 Satz 1 EStG — the linear AfA-Satz for buildings, keyed on the Baujahr
 * (Fertigstellung). The three statutory bands, cited verbatim (product ADR-032: no invented
 * percentage):
 *   - bis einschließlich 1924 fertiggestellt → 2,5 %;
 *   - nach dem 31.12.1924 und vor dem 1.1.2023 fertiggestellt → 2 %;
 *   - nach dem 31.12.2022 fertiggestellt (Wohngebäude, § 7 Abs. 4 Satz 1 Nr. 2 i.d.F. des
 *     JStG 2022) → 3 %.
 * A non-integer or negative Baujahr is OFFEN (null), never guessed.
 */
export function afaSatzProzent(baujahr: number): number | null {
  if (!Number.isInteger(baujahr) || baujahr < 0) return null
  if (baujahr <= 1924) return 2.5
  if (baujahr <= 2022) return 2
  return 3
}

// --- Guided mask (ONE Vermietungsobjekt, ADR-036 Scan-Fallback) --------------------------------

/** The four captured facts of the guided mask for one object. */
export type VermietungFeldId = 'mieteinnahmen' | 'anschaffungskosten' | 'baujahr' | 'werbungskosten'

/** The closed field-id list — the single source the fold and the API's `:feld` boundary both read. */
export const VERMIETUNG_FELDER: readonly VermietungFeldId[] = ['mieteinnahmen', 'anschaffungskosten', 'baujahr', 'werbungskosten']

/** One field's honest capture state. `wert` is a non-negative integer when `erfasst`. */
export type VermietungFeldZustand =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

/**
 * One object's guided-mask data. `id` is the stable object key (assigned by the API on create);
 * the four fields are transcribed facts. All four are required inputs: Werbungskosten may be 0,
 * but that 0 is the USER's entry, never a zero the kernel invents (ADR-032).
 */
export interface VermietungsobjektDaten {
  readonly id: string
  readonly mieteinnahmen: VermietungFeldZustand
  readonly anschaffungskosten: VermietungFeldZustand
  readonly baujahr: VermietungFeldZustand
  readonly werbungskosten: VermietungFeldZustand
}

/** The guided mask's starting point for a fresh object — every field open, nothing guessed. */
export function leeresVermietungsobjekt(id: string): VermietungsobjektDaten {
  return {
    id,
    mieteinnahmen: { kind: 'offen' },
    anschaffungskosten: { kind: 'offen' },
    baujahr: { kind: 'offen' },
    werbungskosten: { kind: 'offen' },
  }
}

/** A captured value must be a non-negative integer (whole euros / a year). */
export function istGueltigerVermietungBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

/** The one setter for a field — returns a copy with that field replaced, throwing on an invalid erfasst. */
export function setzeVermietungFeld(objekt: VermietungsobjektDaten, feld: VermietungFeldId, zustand: VermietungFeldZustand): VermietungsobjektDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerVermietungBetrag(zustand.wert)) {
    throw new RangeError(`vermietung: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...objekt, [feld]: zustand }
}

// --------------------------------------------------------------------------------------------
// Persistence encoding — the one place the "offen / unklar / erfasst" states map to a stored
// string (ADR-0033's one-rule instinct, same as lstb.ts/rente.ts/kapital.ts). `null` is `offen`,
// the reserved marker `unklar` is "looked but could not read", any other string is a
// non-negative integer (`erfasst`).
// --------------------------------------------------------------------------------------------

/** The reserved stored value for a field the user looked at and could not read ("unklar"). */
export const VERMIETUNG_UNKLAR = 'unklar'

/** A field state → its stored string (`null` for `offen`). */
export function serialisiereVermietungFeld(zustand: VermietungFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return VERMIETUNG_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

/** A stored string → its field state. A value that is neither is corruption — throw, don't guess. */
export function deserialisiereVermietungFeld(value: string | null): VermietungFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === VERMIETUNG_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerVermietungBetrag(wert)) {
    throw new Error(`vermietung: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

// --- Per-object facts and the fold ------------------------------------------------------------

/** The AfA Herkunft — the § 7 Abs. 4 Satz 1 EStG citation that produced the percentage. */
export function afaHerkunft(baujahr: number, prozent: number): string {
  return `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${prozent} % bei Baujahr ${baujahr}`
}

/**
 * One object's honest facts (ticket 10.6 AC 2 — "Werbungskosten je Objekt mit Herkunft; offen
 * wo offen"). `einnahmen`/`werbungskosten` are the captured figures (null = not captured);
 * `afa` carries the computed Betrag AND its § 7 Abs. 4 Herkunft; `offenePosten` counts the
 * blocked results (Mieteinnahmen, AfA, Werbungskosten — max 3 per object), never fabricated.
 */
export interface VermietungsobjektFakten {
  readonly einnahmen: number | null
  readonly werbungskosten: number | null
  readonly afa: { readonly betrag: number; readonly herkunft: string } | null
  readonly offenePosten: number
}

/** One object's guided-mask data → its honest facts. Never guesses an amount. */
export function vermietungsobjektFakten(objekt: VermietungsobjektDaten): VermietungsobjektFakten {
  let offenePosten = 0

  const einnahmen = objekt.mieteinnahmen.kind === 'erfasst' ? objekt.mieteinnahmen.wert : null
  if (objekt.mieteinnahmen.kind !== 'erfasst') offenePosten += 1

  const werbungskosten = objekt.werbungskosten.kind === 'erfasst' ? objekt.werbungskosten.wert : null
  if (objekt.werbungskosten.kind !== 'erfasst') offenePosten += 1

  let afa: VermietungsobjektFakten['afa'] = null
  if (objekt.anschaffungskosten.kind === 'erfasst' && objekt.baujahr.kind === 'erfasst') {
    const prozent = afaSatzProzent(objekt.baujahr.wert)
    if (prozent !== null) {
      const betrag = Math.round(objekt.anschaffungskosten.wert * (prozent / 100))
      afa = { betrag, herkunft: afaHerkunft(objekt.baujahr.wert, prozent) }
    }
  }
  if (afa === null) offenePosten += 1

  return { einnahmen, werbungskosten, afa, offenePosten }
}

/** One object's Mieteinnahmen → the core's Einnahme-Posten (Herkunft eingabe). Null while open. */
export function vermietungsobjektAlsEinnahmePosten(objekt: VermietungsobjektDaten): Posten | null {
  if (objekt.mieteinnahmen.kind !== 'erfasst') return null
  return {
    id: `vermietung-${objekt.id}`,
    einkunftsart: 'Vermietung',
    betrag: objekt.mieteinnahmen.wert,
    quelle: { art: 'eingabe' },
  }
}

/**
 * The fold over ALL objects: the Mieteinnahmen fold through `berechne` (Einnahme-Posten je
 * Objekt, Herkunft eingabe); Werbungskosten and AfA are summed SEPARATELY — reported, never
 * subtracted (the net calc is the tax-formula slice's work). `offenePosten` is the sum of the
 * per-object blocked results; `gegated` passes through unchanged, so a
 * Verkauf/möbliert-Anleger (declared `Vermietung`, gated by ADR-033) reads offen with the gate
 * named.
 */
export interface VermietungStand {
  readonly kind: 'bestimmt' | 'offen'
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
  /** Sum of CAPTURED Werbungskosten — a partial truth stated as a partial truth (ADR-015/032). */
  readonly werbungskosten: number
  /** Sum of the computed lineare AfA. */
  readonly afa: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly Einkunftsart[]
}

/** Fold all objects through the deterministic core — bestimmt only when nothing blocks. */
export function vermietungStand(objekte: readonly VermietungsobjektDaten[], gegated: readonly Einkunftsart[]): VermietungStand {
  const posten: Posten[] = []
  let offenePosten = 0
  let werbungskosten = 0
  let afa = 0
  for (const objekt of objekte) {
    const kernposten = vermietungsobjektAlsEinnahmePosten(objekt)
    if (kernposten !== null) posten.push(kernposten)
    const fakten = vermietungsobjektFakten(objekt)
    offenePosten += fakten.offenePosten
    if (fakten.werbungskosten !== null) werbungskosten += fakten.werbungskosten
    if (fakten.afa !== null) afa += fakten.afa.betrag
  }

  const fold = berechne({ posten, offenePosten, konflikte: [], gegated })

  if (fold.kind === 'bestimmt') {
    return {
      kind: 'bestimmt',
      einnahmen: fold.einnahmen,
      vorsorgeaufwand: fold.vorsorgeaufwand,
      anrechnung: fold.anrechnung,
      werbungskosten,
      afa,
      offenePosten,
      konflikte: 0,
      gegated: [],
    }
  }
  return {
    kind: 'offen',
    einnahmen: fold.einnahmen,
    vorsorgeaufwand: fold.vorsorgeaufwand,
    anrechnung: fold.anrechnung,
    werbungskosten,
    afa,
    offenePosten,
    konflikte: 0,
    gegated: fold.gegated,
  }
}
