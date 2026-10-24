// ADR-029/036/013 — the Grenzgänger-CH vertical's domain. Three things live here:
// (1) the guided fallback mask for the CH-Lohnausweis (ADR-036: "die Ziffernliste erscheint
//     wie auf dem Papier, Feld für Feld" — Scan/OCR is OUT of scope, ADR-045);
// (2) the Grenzgänger-Status (ADR-013: nur Schweiz, 45-Tage-Regel);
// (3) the CH line items → the deterministic core, each amount CHF→EUR via a Wechselkurs with
//     provenance "Lohnausweis Ziffer n × Kurs" (ADR-029/012/036).
// Pure, no I/O (ADR-0004). No tax FORMULA is invented here: the Quellensteuer/ PK/ 3a/ KK/
// Zulagen amounts come FROM the Lohnausweis/Nachweise (data), never from a guessed rate —
// "KEINE Schätzungen, offen wo unklar" (ADR-032 honesty). What is not computable is modelled
// as OFFEN, never as a point value.
import type { Einkunftsart } from './einkunftsarten.js'
import type { Posten } from './berechnung.js'
import { chfNachEur, type Wechselkurs } from './wechselkurs.js'
import { CH_WOHNSITZ_VALUES, type ChWohnsitz } from './interview.js'

// Re-exported so the domain stays importable from one place; the Wohnsitz vocabulary itself
// lives in interview.ts (the persisted answer values — ADR-0033's one-rule instinct).
export { CH_WOHNSITZ_VALUES }
export type { ChWohnsitz }

// --- Grenzgänger-Status (ADR-013 — nur Schweiz, 45-Tage-Regel) ---------------------------

/** The 45-Tage rule (ADR-013): more than 45 Nichtrückkehrtage ends Grenzgänger status. */
export const GRENZGAENGER_NICHTRUECKKEHRTAGE = 45

export type GrenzgaengerStatus = 'echter-grenzgaenger' | 'kein-grenzgaenger'

/**
 * ADR-013's 45-Tage-Zähler. A DE-Wohnsitz with <= 45 Nichtrückkehrtage is an echter
 * Grenzgänger (4,5 % Quellensteuer, ADR-029/013); more than 45 days, or a CH-Wohnsitz, is
 * not. Throws on a negative/non-integer day count — it is a count of days, not a free number.
 */
export function grenzgaengerStatus(wohnsitz: ChWohnsitz, nichtrueckkehrtage: number): GrenzgaengerStatus {
  if (!Number.isInteger(nichtrueckkehrtage) || nichtrueckkehrtage < 0) {
    throw new RangeError('nichtrueckkehrtage must be a non-negative integer')
  }
  if (wohnsitz === 'Schweiz') return 'kein-grenzgaenger'
  return nichtrueckkehrtage > GRENZGAENGER_NICHTRUECKKEHRTAGE ? 'kein-grenzgaenger' : 'echter-grenzgaenger'
}

// --- Lohnausweis-Maske (ADR-036 Fallback) ------------------------------------------------

/** The 15 Ziffern of the CH-Lohnausweis (Formular 11), as machine keys. */
export type LohnausweisFeldId =
  | 'lohn' // Ziffer 1 — Lohn (Grundlohn)
  | 'gehaltsnebenleistungen' // Ziffer 2
  | 'unregelmaessige-leistungen' // Ziffer 3
  | 'kapitalleistungen' // Ziffer 4
  | 'beteiligungsrechte' // Ziffer 5
  | 'sitzungsgelder' // Ziffer 6
  | 'andere-leistungen' // Ziffer 7
  | 'bruttolohn-total' // Ziffer 8 — Total Bruttolohn
  | 'ahv-beitraege' // Ziffer 9 — AHV/IV/EO/ALV/NBUV (1. Säule)
  | 'berufliche-vorsorge' // Ziffer 10 — berufliche Vorsorge (2. Säule / PK)
  | 'nettolohn' // Ziffer 11 — Nettolohn (8 abzgl. 9+10)
  | 'quellensteuer' // Ziffer 12 — Quellensteuerabzug
  | 'spesen' // Ziffer 13
  | 'weitere-nebenleistungen' // Ziffer 14
  | 'bemerkungen' // Ziffer 15 — Freitext

export interface LohnausweisFeld {
  /** The box number on the paper (1–15), kept as a string because sub-fields exist (10.1/13.1). */
  readonly ziffer: string
  readonly id: LohnausweisFeldId
  /** CHF amount or free text. Only `bemerkungen` is Freitext. */
  readonly art: 'chf-betrag' | 'freitext'
  /** Feeds a ChPosten in this slice (ADR-029) — the rest are captured for verifiability. */
  readonly postenRelevant: boolean
}

/**
 * ADR-036's guided mask — the Ziffern in paper order (1–15). Only the fields ADR-029 maps
 * onto Posten are `postenRelevant`: Bruttolohn (Einkünfte), Quellensteuer (Anrechnung),
 * berufliche Vorsorge (Vorsorgeaufwand). AHV (1. Säule) is captured but its DBA treatment
 * is open (not a Posten here). The exact Ziffern follow Formular 11 (ESTV).
 */
export const LOHNAUSWEIS_FELDER: readonly LohnausweisFeld[] = [
  { ziffer: '1', id: 'lohn', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '2', id: 'gehaltsnebenleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '3', id: 'unregelmaessige-leistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '4', id: 'kapitalleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '5', id: 'beteiligungsrechte', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '6', id: 'sitzungsgelder', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '7', id: 'andere-leistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '8', id: 'bruttolohn-total', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '9', id: 'ahv-beitraege', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '10', id: 'berufliche-vorsorge', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '11', id: 'nettolohn', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '12', id: 'quellensteuer', art: 'chf-betrag', postenRelevant: true },
  { ziffer: '13', id: 'spesen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '14', id: 'weitere-nebenleistungen', art: 'chf-betrag', postenRelevant: false },
  { ziffer: '15', id: 'bemerkungen', art: 'freitext', postenRelevant: false },
]

/** The CHF amounts a user typed into the mask, sparse (a missing key = "not yet entered"). */
export type LohnausweisWerte = Partial<Record<LohnausweisFeldId, number>>

/**
 * The required-but-empty Lohnausweis fields — the honest "offen" list. Always required:
 * Bruttolohn and berufliche Vorsorge (they feed the income/Vorsorge Posten). Quellensteuer
 * is required only for an echten Grenzgänger (the persona whose 4,5 % is withheld) — a
 * CH-Ansässiger has none and must not be told a field is missing.
 */
export function offeneLohnausweisFelder(werte: LohnausweisWerte, status: GrenzgaengerStatus): readonly LohnausweisFeldId[] {
  const required = new Set<LohnausweisFeldId>(['bruttolohn-total', 'berufliche-vorsorge'])
  if (status === 'echter-grenzgaenger') required.add('quellensteuer')
  return LOHNAUSWEIS_FELDER.filter((feld) => required.has(feld.id) && werte[feld.id] === undefined).map((feld) => feld.id)
}

// --- CH line items (ADR-029) --------------------------------------------------------------

/** The CH line-item kinds. German domain terms (ADR-0033), like Einkunftsart's values. */
export type ChPostenArt =
  | 'Bruttolohn' // Einkünfte (income)
  | 'Quellensteuer' // Anrechnung (credit against the German tax)
  | 'Pensionskasse' // Vorsorgeaufwand (2. Säule)
  | 'AHV' // 1. Säule — captured, DBA treatment open
  | 'Saeule3a' // gebundene Selbstvorsorge, limited deductibility (honest bound)
  | 'Krankenkasse' // Basisvorsorge
  | 'Familienzulage' // netted with Kindergeld (ADR-029 point 6)

/**
 * A CH line item with full provenance — ADR-029's "Herkunft pro Wert 'Lohnausweis Ziffer n
 * × Kurs'". `betragEur` is `chfNachEur(betragChf, kurs.kurs)` rounded to whole cents.
 */
export interface ChPosten {
  readonly id: string
  readonly art: ChPostenArt
  /** The Lohnausweis Ziffer (when the value came from the Lohnausweis). */
  readonly ziffer?: string
  readonly betragChf: number
  readonly wechselkurs: Wechselkurs
  readonly betragEur: number
}

function feldZuPostenArt(feld: LohnausweisFeldId): ChPostenArt {
  switch (feld) {
    case 'bruttolohn-total':
      return 'Bruttolohn'
    case 'quellensteuer':
      return 'Quellensteuer'
    case 'berufliche-vorsorge':
      return 'Pensionskasse'
    case 'ahv-beitraege':
      return 'AHV'
    default:
      // Unreachable for a postenRelevant field; total so a new field can never silently map.
      throw new RangeError(`Lohnausweis field "${feld}" has no ChPosten mapping`)
  }
}

function makeChPosten(id: string, art: ChPostenArt, betragChf: number, wechselkurs: Wechselkurs, ziffer?: string): ChPosten {
  return { id, art, betragChf, wechselkurs, betragEur: chfNachEur(betragChf, wechselkurs.kurs), ...(ziffer !== undefined ? { ziffer } : {}) }
}

/**
 * ADR-029 — map the Lohnausweis CHF values into CH line items, converting each to EUR via the
 * Wechselkurs. Only `postenRelevant` fields that are PRESENT become Posten; a required-but-empty
 * field is the caller's `offeneLohnausweisFelder`, never a zero-fabrication here.
 */
export function chPostenAusLohnausweis(werte: LohnausweisWerte, wechselkurs: Wechselkurs): readonly ChPosten[] {
  const posten: ChPosten[] = []
  for (const feld of LOHNAUSWEIS_FELDER) {
    if (!feld.postenRelevant || feld.art !== 'chf-betrag') continue
    const betragChf = werte[feld.id]
    if (betragChf === undefined) continue
    posten.push(makeChPosten(`ch-lohnausweis-${feld.id}`, feldZuPostenArt(feld.id), betragChf, wechselkurs, feld.ziffer))
  }
  return posten
}

/** Säule 3a (ADR-029 point 4) — captured + converted; the legal deductibility limit is NOT
 *  computed here (that is the tax-formula slice's work, honestly named). */
export function saeule3aAbzug(eingezahltChf: number, wechselkurs: Wechselkurs): ChPosten {
  return makeChPosten('ch-saeule-3a', 'Saeule3a', eingezahltChf, wechselkurs)
}

/** CH-Krankenkasse (ADR-029 point 5) — Basisvorsorge, converted with provenance. */
export function krankenkasseAbzug(beitragChf: number, wechselkurs: Wechselkurs): ChPosten {
  return makeChPosten('ch-krankenkasse', 'Krankenkasse', beitragChf, wechselkurs)
}

/**
 * ADR-029 point 6 — Familienzulagen are netted against the German Kindergeld. Returns the NET
 * in EUR: a positive value means the CH Zulage exceeds the Kindergeld (the surplus is what the
 * German side must consider); negative means Kindergeld exceeds the Zulage. The Günstigerprüfung
 * that later weighs the two is Phase 2 (M1) — this is the honest netting datengrundlage, not a
 * verdict.
 */
export function zulagenVerrechnen(chZulagenEur: number, deKindergeldEur: number): number {
  if (!Number.isFinite(chZulagenEur) || chZulagenEur < 0) throw new RangeError('chZulagenEur must be a non-negative finite number')
  if (!Number.isFinite(deKindergeldEur) || deKindergeldEur < 0) {
    throw new RangeError('deKindergeldEur must be a non-negative finite number')
  }
  return Math.round((chZulagenEur - deKindergeldEur) * 100) / 100
}

/**
 * ADR-029 "automatisch auf Anlage N-Gre gemappt" — the ONE line that maps onto the core's
 * income-only Posten model: the Bruttolohn becomes a `Posten` of Einkunftsart `Grenzgänger`.
 * The deduction/credit lines (PK, Quellensteuer, 3a, KK, Zulagen) are NOT representable as the
 * core's income Posten today — extending the core with Vorsorgeaufwand/Anrechnung is the
 * tax-formula slice's shared work (ADR-0015-Lehre, coordinated with the Angestellten vertical).
 * Returns null for any non-income line (the caller keeps the full ChPosten for its provenance).
 */
export function bruttolohnAlsKernposten(posten: ChPosten): Posten | null {
  if (posten.art !== 'Bruttolohn') return null
  const einkunftsart: Einkunftsart = 'Grenzgänger'
  return {
    id: posten.id,
    einkunftsart,
    betrag: Math.round(posten.betragEur),
    // The amount's origin is the Lohnausweis (a Beleg); the Kurs provenance stays on the
    // ChPosten (the core Posten model has no slot for a compound "value × rate" origin).
    quelle: { art: 'beleg', belegId: 'lohnausweis' },
  }
}
