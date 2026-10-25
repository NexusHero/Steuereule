// Kapital-Vertikale (ticket 10.5, product ADR-032 — Kapitalerträge in 1.0, Krypto bleibt 2.0).
// Three things live here:
// (1) the depot-Einordnung — the interview answer `kap-depot` ('Deutscher Broker' |
//     'Ausländischer Broker' | 'Krypto', interview.ts KAP_DEPOT_VALUES) mapped onto what it
//     MEANS for the Steuererklärung: a German broker withheld Abgeltungsteuer (or was covered
//     by a Freistellungsauftrag), a foreign broker withheld NOTHING — those Kapitalerträge
//     are a Pflichtveranlagung (Anlage KAP, tarifliche Besteuerung, never a silent guess that
//     Abgeltungsteuer applies), and Krypto is gated (product ADR-032 §2: 2.0, honest gate,
//     no half feature);
// (2) the guided-mask data interface (Jahressteuerbescheinigung fallback, same
//     offen/unklar/erfasst honesty as lstb.ts/rente.ts) — one captured fact: the
//     Kapitalerträge (Einkünfte aus Kapitalvermögen, whole euros);
// (3) its fold into the deterministic core (`berechne`) with Herkunft — the amount is never
//     fabricated: a missing/unklar Kapitalerträge field is OFFEN, never a guessed zero
//     (product ADR-032 honesty).
//
// The § 32d Abs. 6 Günstigerprüfung (Abgeltungsteuer vs. persönlicher Satz) is deliberately
// NOT here — it is its own module (guenstigerpruefung.ts), the comparison the name
// "Günstigerprüfung" is reserved for (ADR-0034 §1).
//
// Pure, no I/O (ADR-0004).
import { berechne, type Berechnungsstand, type Posten } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'

// --- Depot-Einordnung (product ADR-032) ------------------------------------------------------

/**
 * The three `kap-depot` interview answers (interview.ts KAP_DEPOT_VALUES), the closed
 * vocabulary this module reasons over. German domain terms, byte-equal to the persisted
 * answer values (ADR-0033 citation form).
 */
export type KapDepotAntwort = 'Deutscher Broker' | 'Ausländischer Broker' | 'Krypto'

/** Canonical order — `KAP_DEPOT_ANTWORTEN` returned in this order, a deterministic array. */
export const KAP_DEPOT_ANTWORTEN: readonly KapDepotAntwort[] = [
  'Deutscher Broker',
  'Ausländischer Broker',
  'Krypto',
]

/** Total over `string`: is `value` a declared kap-depot answer? */
export function istKapDepotAntwort(value: string): value is KapDepotAntwort {
  return (KAP_DEPOT_ANTWORTEN as readonly string[]).includes(value)
}

/**
 * What the depot answer MEANS for the Steuererklärung (product ADR-032 §2, ticket 10.5 AC 3):
 *
 *   - `deutscher-broker` — a domestic bank: Abgeltungsteuer was withheld (or the
 *     Sparerpauschbetrag was exhausted via Freistellungsauftrag). The § 32d Abs. 6
 *     Günstigerprüfung is the question that applies here.
 *   - `auslaendischer-broker` — no German tax was withheld. These Kapitalerträge are a
 *     Pflichtveranlagung (Anlage KAP), taxed at the personal tariff — the Günstigerprüfung is
 *     moot, and pretending Abgeltungsteuer had been withheld would be a fabrication
 *     (ADR-032). The honest KAP-Pflicht statement is DERIVED here, rendered in i18n.
 *   - `krypto` — gated in 1.0 (product ADR-032 §2: private Veräußerungsgeschäft, Haltefristen,
 *     own acquisition logic). `gatedEinkunftsarten` already gates the declared `Kapital`
 *     Einkunftsart for this answer; this Einordnung names the gate for the screen.
 *   - `unbekannt` — the answer is missing: nothing is guessed.
 */
export type KapitalDepotEinordnung =
  | { readonly kind: 'deutscher-broker' }
  | { readonly kind: 'auslaendischer-broker' }
  | { readonly kind: 'krypto' }
  | { readonly kind: 'unbekannt' }

/** The `kap-depot` answer (or its absence) → the depot-Einordnung. Never guesses. */
export function ordneKapDepotEin(kapDepot: string | undefined): KapitalDepotEinordnung {
  switch (kapDepot) {
    case 'Deutscher Broker':
      return { kind: 'deutscher-broker' }
    case 'Ausländischer Broker':
      return { kind: 'auslaendischer-broker' }
    case 'Krypto':
      return { kind: 'krypto' }
    default:
      return { kind: 'unbekannt' }
  }
}

/** The § 32d Abs. 6 Günstigerprüfung applies ONLY where Abgeltungsteuer was actually withheld. */
export function istGuenstigerpruefungAnwendbar(einordnung: KapitalDepotEinordnung): boolean {
  return einordnung.kind === 'deutscher-broker'
}

// --- Guided mask (Jahressteuerbescheinigung fallback, ADR-036 Scan-Fallback) ------------------

/** The one captured fact of the guided mask. */
export type KapitalFeldId = 'kapitalertraege'

/** The closed field-id list — the single source the fold and the API's `:feld` boundary both read. */
export const KAPITAL_FELDER: readonly KapitalFeldId[] = ['kapitalertraege']

/** One field's honest capture state. `wert` is a non-negative integer when `erfasst`. */
export type KapitalFeldZustand =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

/** The guided mask's data — the Kapitalerträge (Einkünfte aus Kapitalvermögen) as a transcribed fact. */
export interface KapitalDaten {
  readonly kapitalertraege: KapitalFeldZustand
}

/** The guided mask's starting point — the field open, nothing guessed. */
export const LEERES_KAPITAL: KapitalDaten = {
  kapitalertraege: { kind: 'offen' },
}

/** A captured value must be a non-negative integer (whole euros). */
export function istGueltigerKapitalBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

/** The one setter for the field — returns a copy, throwing on an invalid erfasst. */
export function setzeKapitalFeld(daten: KapitalDaten, feld: KapitalFeldId, zustand: KapitalFeldZustand): KapitalDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerKapitalBetrag(zustand.wert)) {
    throw new RangeError(`kapital: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

// --------------------------------------------------------------------------------------------
// Persistence encoding — the one place the "offen / unklar / erfasst" states map to a stored
// string (ADR-0033's one-rule instinct, same as lstb.ts/rente.ts). `null` is `offen`, the
// reserved marker `unklar` is "looked but could not read", any other string is a non-negative
// integer (`erfasst`).
// --------------------------------------------------------------------------------------------

/** The reserved stored value for a field the user looked at and could not read ("unklar"). */
export const KAPITAL_UNKLAR = 'unklar'

/** A field state → its stored string (`null` for `offen`). */
export function serialisiereKapitalFeld(zustand: KapitalFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return KAPITAL_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

/** A stored string → its field state. A value that is neither is corruption — throw, don't guess. */
export function deserialisiereKapitalFeld(value: string | null): KapitalFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === KAPITAL_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerKapitalBetrag(wert)) {
    throw new Error(`kapital: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

// --- Fold into the deterministic core --------------------------------------------------------

/**
 * Map the guided-mask data onto the core's income `Posten` — the Kapitalerträge (whole euros,
 * as transcribed) with Herkunft `eingabe` (the guided mask is a manual transcription; the
 * Beleg-/KI-Vorschlag-Herkunft is the Zuordnungs-Slice's work — the `Quelle` contract already
 * carries those variants, ticket 10.5 AC 1). Returns null when the field is not yet
 * determinable — the caller reports that as OFFEN, never as a fabricated zero (product ADR-032).
 */
export function kapitalAlsKernposten(kapital: KapitalDaten): Posten | null {
  if (kapital.kapitalertraege.kind !== 'erfasst') return null
  return {
    id: 'kapital',
    einkunftsart: 'Kapital',
    betrag: kapital.kapitalertraege.wert,
    quelle: { art: 'eingabe' },
  }
}

/**
 * Fold the guided-mask data through the deterministic core (`berechne`). A determinable
 * Kapitalerträge field yields the amount in `einnahmen`; an open/unklar field is OFFEN with
 * one open posten — never a fabricated zero. `gegated` is passed through unchanged, so a
 * Krypto-Anleger (declared `Kapital`, gated by ADR-032) reads OFFEN with the gate named.
 */
export function kapitalStand(kapital: KapitalDaten, gegated: readonly Einkunftsart[]): Berechnungsstand {
  const kernposten = kapitalAlsKernposten(kapital)
  const posten: Posten[] = kernposten === null ? [] : [kernposten]
  const offenePosten = kernposten === null ? 1 : 0
  return berechne({ posten, offenePosten, konflikte: [], gegated })
}
