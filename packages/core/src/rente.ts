// Rentner-Vertikale (ticket 10.4, product ADR-034 — Anlage R). Three things live here:
// (1) the closed `Rentenart` vocabulary (product ADR-036 §3: gesetzliche Rente, Betriebsrente/PK DE,
//     private Rentenversicherung, Witwen-/Waisenrente, ausländische Rente/CH AHV);
// (2) the two statutory percentage tables that turn a Rentenbeginn-Jahr (Besteuerungsanteil,
//     § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — the Kohorten-Tabelle) or a
//     Rentenbeginn-Lebensalter (Ertragsanteil, § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG)
//     into the taxable share of a pension;
// (3) the guided-mask data interface (Rentenbezugsmitteilung fallback, same offen/unklar/erfasst
//     honesty as lstb.ts) and its fold into the deterministic core (`berechne`) with Herkunft —
//     an amount is never fabricated: a missing Jahresbetrag, a missing Rentenbeginn-Jahr or a year
//     outside the statutory table is OFFEN, never a guessed zero (product ADR-032 honesty).
//
// Pure, no I/O (ADR-0004). No tax FORMULA is invented here: the Besteuerungs-/Ertragsanteil
// percentages come FROM the statute (verbatim tables, not derived arithmetic), and the taxable
// share is Jahresbetrag × Anteil — the tariff/Günstigerprüfung over that share is a later slice.
import { berechne, type Berechnungsstand, type Posten } from './berechnung.js'
import type { Einkunftsart } from './einkunftsarten.js'

// --- Rentenart-Vokabular (product ADR-036 §3) ------------------------------------------------

/**
 * The five pension kinds 1.0 covers (product ADR-036 §3). German domain terms, byte-equal to the
 * product ADR's wording (ADR-0033 citation form) — persisted as-is, UI labels live in i18n, never
 * here. All five are Anlage-R-fähig (product ADR-034).
 */
export type Rentenart =
  | 'GesetzlicheRente' // gesetzliche Rentenversicherung (Anlage R)
  | 'Betriebsrente' // Betriebsrente / bAV / Pensionskasse DE (Anlage R)
  | 'PrivateRentenversicherung' // private Rentenversicherung — Ertragsanteil (bb)
  | 'WitwenWaisenrente' // Witwen-/Waisenrente (Anlage R)
  | 'AuslaendischeRente' // ausländische Rente (CH AHV — der Ex-Grenzgänger-Fall)

/** Canonical order — `RENTENARTEN` returned in this order, a deterministic array. */
export const RENTENARTEN: readonly Rentenart[] = [
  'GesetzlicheRente',
  'Betriebsrente',
  'PrivateRentenversicherung',
  'WitwenWaisenrente',
  'AuslaendischeRente',
]

/** Total over `string`: is `value` a declared Rentenart? (mirrors isEinkunftsart's totalism). */
export function isRentenart(value: string): value is Rentenart {
  return (RENTENARTEN as readonly string[]).includes(value)
}

// --- Besteuerungsanteil (Kohorten-Tabelle, § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG) --

/**
 * The statutory Kohorten-Tabelle, verbatim (not derived arithmetic — product ADR-032: no invented
 * percentages). Key = Jahr des Rentenbeginns (2006–2058), value = Besteuerungsanteil in Prozent.
 * The two boundary rules live in `besteuerungsanteilProzent`:
 *   - Rentenbeginn bis einschließlich 2005 → 50 % (the table's first row);
 *   - Rentenbeginn nach 2058 → OFFEN (null): the table ends at 2058 and the Wachstumschancengesetz
 *     already moved that endpoint once (2040 → 2058), so a later year is never guessed.
 */
const BESTEUERUNGSANTEIL_TABELLE: Readonly<Record<number, number>> = {
  2006: 52, 2007: 54, 2008: 56, 2009: 58, 2010: 60,
  2011: 62, 2012: 64, 2013: 66, 2014: 68, 2015: 70,
  2016: 72, 2017: 74, 2018: 76, 2019: 78, 2020: 80,
  2021: 81, 2022: 82,
  2023: 82.5, 2024: 83, 2025: 83.5, 2026: 84, 2027: 84.5, 2028: 85, 2029: 85.5, 2030: 86,
  2031: 86.5, 2032: 87, 2033: 87.5, 2034: 88, 2035: 88.5, 2036: 89, 2037: 89.5, 2038: 90,
  2039: 90.5, 2040: 91, 2041: 91.5, 2042: 92, 2043: 92.5, 2044: 93, 2045: 93.5, 2046: 94,
  2047: 94.5, 2048: 95, 2049: 95.5, 2050: 96, 2051: 96.5, 2052: 97, 2053: 97.5, 2054: 98,
  2055: 98.5, 2056: 99, 2057: 99.5, 2058: 100,
}

/**
 * § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — the Besteuerungsanteil for a pension that
 * started in `rentenbeginnJahr`. Returns the percentage, or `null` (OFFEN) when the year is outside
 * the statutory table — a future/out-of-range year is never guessed. Percentages are whole or
 * half-point values, all exactly representable in IEEE 754.
 */
export function besteuerungsanteilProzent(rentenbeginnJahr: number): number | null {
  if (!Number.isInteger(rentenbeginnJahr) || rentenbeginnJahr < 0) return null
  if (rentenbeginnJahr <= 2005) return 50
  if (rentenbeginnJahr > 2058) return null
  return BESTEUERUNGSANTEIL_TABELLE[rentenbeginnJahr] ?? null
}

// --- Ertragsanteil (Lebensalter-Tabelle, § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG) ---

/** A [von, bis, prozent] age-band of the Ertragsanteil-Tabelle (vollendetes Lebensjahr). */
const ERTRAGSANTEIL_TABELLE: readonly (readonly [number, number, number])[] = [
  [0, 1, 59], [2, 3, 58], [4, 5, 57], [6, 8, 56], [9, 10, 55],
  [11, 12, 54], [13, 14, 53], [15, 16, 52], [17, 18, 51], [19, 20, 50],
  [21, 22, 49], [23, 24, 48], [25, 26, 47], [27, 27, 46], [28, 29, 45],
  [30, 31, 44], [32, 32, 43], [33, 34, 42], [35, 35, 41], [36, 37, 40],
  [38, 38, 39], [39, 40, 38], [41, 41, 37], [42, 42, 36], [43, 44, 35],
  [45, 45, 34], [46, 47, 33], [48, 48, 32], [49, 49, 31], [50, 50, 30],
  [51, 52, 29], [53, 53, 28], [54, 54, 27], [55, 56, 26], [57, 57, 25],
  [58, 58, 24], [59, 59, 23], [60, 61, 22], [62, 62, 21], [63, 63, 20],
  [64, 64, 19], [65, 66, 18], [67, 67, 17], [68, 68, 16], [69, 70, 15],
  [71, 71, 14], [72, 73, 13], [74, 74, 12], [75, 75, 11], [76, 77, 10],
  [78, 79, 9], [80, 80, 8], [81, 82, 7], [83, 84, 6], [85, 87, 5],
  [88, 91, 4], [92, 93, 3], [94, 96, 2],
]

/**
 * § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — the Ertragsanteil for a private
 * Rentenversicherung, keyed on the vollendetes Lebensjahr at rent begin. `>= 97` is the table's
 * terminal "ab 97" row (1 %); a negative or non-integer age is OFFEN (null), never guessed.
 */
export function ertragsanteilProzent(vollendetesLebensjahr: number): number | null {
  if (!Number.isInteger(vollendetesLebensjahr) || vollendetesLebensjahr < 0) return null
  if (vollendetesLebensjahr >= 97) return 1
  for (const [von, bis, prozent] of ERTRAGSANTEIL_TABELLE) {
    if (vollendetesLebensjahr >= von && vollendetesLebensjahr <= bis) return prozent
  }
  return null
}

/**
 * Which statutory table a Rentenart is taxed through. Everything EXCEPT the private
 * Rentenversicherung uses the Besteuerungsanteil (Kohorten-Tabelle by Rentenbeginn-Jahr); the
 * private Rentenversicherung is taxed through the Ertragsanteil (by Rentenbeginn-Lebensalter).
 * CH AHV is a foreign pension comparable to a German statutory pension, so it uses the
 * Besteuerungsanteil too.
 */
export function verwendetBesteuerungsanteil(art: Rentenart): boolean {
  return art !== 'PrivateRentenversicherung'
}

// --- Guided mask (Rentenbezugsmitteilung fallback, ADR-036 Scan-Fallback) ---------------------

/** The three captured facts of the guided mask. */
export type RentenFeldId = 'jahresbetrag' | 'rentenbeginnJahr' | 'alterBeiRentenbeginn'

/** The closed field-id list — the single source the fold and the API's `:feld` boundary both read. */
export const RENTEN_FELDER: readonly RentenFeldId[] = ['jahresbetrag', 'rentenbeginnJahr', 'alterBeiRentenbeginn']

/** One field's honest capture state. `wert` is a non-negative integer when `erfasst`. */
export type RentenFeldZustand =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

/**
 * The guided mask's data. `art` is a CHOICE (null = not yet chosen), the three fields are
 * transcribed facts. `rentenbeginnJahr` feeds the Besteuerungsanteil path, `alterBeiRentenbeginn`
 * feeds the Ertragsanteil path — only the one relevant to the chosen `art` is required by the fold.
 */
export interface RentenDaten {
  readonly art: Rentenart | null
  readonly jahresbetrag: RentenFeldZustand
  readonly rentenbeginnJahr: RentenFeldZustand
  readonly alterBeiRentenbeginn: RentenFeldZustand
}

/** The guided mask's starting point — every field open, no art chosen, nothing guessed. */
export const LEERE_RENTE: RentenDaten = {
  art: null,
  jahresbetrag: { kind: 'offen' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
}

/** A captured value must be a non-negative integer (whole euros / a year / an age). */
export function istGueltigerRentenBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

/** The one setter for a field — returns a copy with that field replaced, throwing on an invalid erfasst. */
export function setzeRentenFeld(daten: RentenDaten, feld: RentenFeldId, zustand: RentenFeldZustand): RentenDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerRentenBetrag(zustand.wert)) {
    throw new RangeError(`rente: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

/** The one setter for the rentenart choice — null clears it, anything else must be a declared Rentenart. */
export function setzeRentenart(daten: RentenDaten, art: Rentenart | null): RentenDaten {
  if (art !== null && !isRentenart(art)) {
    throw new RangeError(`rente: "${art}" is not a declared Rentenart`)
  }
  return { ...daten, art }
}

// --------------------------------------------------------------------------------------------
// Persistence encoding — the one place the "offen / unklar / erfasst" states map to a stored
// string (ADR-0033's one-rule instinct, same as lstb.ts). `null` is `offen`, the reserved marker
// `unklar` is "looked but could not read", any other string is a non-negative integer (`erfasst`).
// --------------------------------------------------------------------------------------------

/** The reserved stored value for a field the user looked at and could not read ("unklar"). */
export const RENTE_UNKLAR = 'unklar'

/** A field state → its stored string (`null` for `offen`). */
export function serialisiereRentenFeld(zustand: RentenFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return RENTE_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

/** A stored string → its field state. A value that is neither is corruption — throw, don't guess. */
export function deserialisiereRentenFeld(value: string | null): RentenFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === RENTE_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerRentenBetrag(wert)) {
    throw new Error(`rente: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

// --- Fold into the deterministic core --------------------------------------------------------

/** The rule citation for the taxable share's Herkunft (ADR-014/015 "regel" origin). */
function besteuerungsanteilHerkunft(rentenbeginnJahr: number, prozent: number): string {
  return `§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn ${rentenbeginnJahr}: ${prozent} %`
}

function ertragsanteilHerkunft(alter: number, prozent: number): string {
  return `§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit ${alter} Jahren: ${prozent} %`
}

/**
 * Map the guided-mask data onto the core's income `Posten` — the taxable share of the Jahresbetrag
 * (Jahresbetrag × Besteuerungs-/Ertragsanteil, rounded to whole euros) with its § 22 Herkunft.
 * Returns null when the rente is not yet determinable: no art chosen, a required field open/unklar,
 * or a Rentenbeginn-Jahr outside the statutory table — the caller reports that as OFFEN, never as a
 * fabricated zero (product ADR-032).
 */
export function renteAlsKernposten(rente: RentenDaten): Posten | null {
  if (rente.art === null || rente.jahresbetrag.kind !== 'erfasst') return null
  const jahresbetrag = rente.jahresbetrag.wert

  if (verwendetBesteuerungsanteil(rente.art)) {
    if (rente.rentenbeginnJahr.kind !== 'erfasst') return null
    const prozent = besteuerungsanteilProzent(rente.rentenbeginnJahr.wert)
    if (prozent === null) return null
    return {
      id: 'rente',
      einkunftsart: 'Rente',
      betrag: Math.round(jahresbetrag * (prozent / 100)),
      quelle: { art: 'regel', regel: besteuerungsanteilHerkunft(rente.rentenbeginnJahr.wert, prozent) },
    }
  }

  if (rente.alterBeiRentenbeginn.kind !== 'erfasst') return null
  const prozent = ertragsanteilProzent(rente.alterBeiRentenbeginn.wert)
  if (prozent === null) return null
  return {
    id: 'rente',
    einkunftsart: 'Rente',
    betrag: Math.round(jahresbetrag * (prozent / 100)),
    quelle: { art: 'regel', regel: ertragsanteilHerkunft(rente.alterBeiRentenbeginn.wert, prozent) },
  }
}

/**
 * Fold the guided-mask data through the deterministic core (`berechne`). A determinable rente
 * yields the taxable share in `einnahmen`; an open/unklar/out-of-table rente is OFFEN with one
 * open posten — never a fabricated zero. `gegated` (declared-but-not-computable Einkunftsarten)
 * is passed through unchanged, so a pensioner who also declared Gewerbe/Krypto still reads OFFEN.
 */
export function renteStand(rente: RentenDaten, gegated: readonly Einkunftsart[]): Berechnungsstand {
  const kernposten = renteAlsKernposten(rente)
  const posten: Posten[] = kernposten === null ? [] : [kernposten]
  const offenePosten = kernposten === null ? 1 : 0
  return berechne({ posten, offenePosten, konflikte: [], gegated })
}
