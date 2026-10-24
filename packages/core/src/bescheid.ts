// Bescheidprüfung 1.0 (ticket 10.3, M7) — the Steuerbescheid domain. Pure, no I/O (ADR-0004).
//
// Three things live here, all deterministic:
//   (1) the Bescheid DATA MODEL — the figures a user transcribes from the Bescheid (guided
//       mask, ADR-036: the numbers appear field by field like on the paper; the PDF/file is
//       stored as a Beleg, but Scan/OCR is OUT of scope, ADR-045), each carrying the honest
//       offen/unklar/erfasst state;
//   (2) the ABGLEICH — Bescheid-Beträge vs. the deterministic core's `berechne` buckets,
//       deviations as a visible diff, never a silent verdict;
//   (3) the KORREKTUR / EINSPRUCH split (Produkt-ADR-009) — before the Bescheid a "Korrigieren"
//       copies the eingereichte Fassung (not the Arbeitsstand), after the Bescheid an Einspruch
//       with a Fristen-Countdown (§ 355 AO) and a Grund-Auswahl.
//
// The bescheid-phase STATE MACHINE (eingegangen → geprüft → einspruch-eingelegt) lives next to
// this in steuerjahr-status.ts (ADR-0039); this module is the DATA + RULES, not the transitions.
//
// Honesty boundaries (ADR-032):
//   - The Abgleich only compares the three buckets `berechne` produces (einnahmen /
//     vorsorgeaufwand / anrechnung). The Bescheid-only figures (festgesetzte Steuer, Erstattung)
//     are captured for the record but have NO computed counterpart until the tariff layer lands
//     — they are shown, never compared against a fabricated "berechnet" value.
//   - When the computed side is incomplete (`berechne` returns 'offen'), the comparison is a
//     partial truth, stated as such (`berechnungUnvollstaendig`), never widened into a verdict.
//   - The Einspruchsfrist is the plain § 355 AO "1 Monat ab Bescheiddatum", day-clamped; the
//     weekend/holiday extension (§ 108 Abs. 3 AO) is a LATER slice, named here not silently
//     omitted (same honesty as werktage.ts's Feiertag boundary).
import type { Berechnungsstand } from './berechnung'
import type { AngestellteFakten } from './angestellte'

// --- Bescheid-Aufnahme (guided mask, ADR-036) ---------------------------------------------

/** The Bescheid buckets that HAVE a computed counterpart in `berechne` — the comparable set. */
export type BescheidBetragFeld = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'

/** The Bescheid-only figures: captured for the record, never compared (no computed counterpart
 *  until the tariff layer). `erstattung` is signed — positive = Erstattung, negative = Nachzahlung. */
export type BescheidNurFeld = 'festgesetzteSteuer' | 'erstattung'

/** Every transcribable Bescheid figure, comparable or not. */
export type BescheidFeld = BescheidBetragFeld | BescheidNurFeld

/** The five figures a Steuerbescheid carries, in paper order, with the comparable flag. */
export interface BescheidFeldDef {
  readonly id: BescheidFeld
  /** `erstattung` is the one signed amount (Nachzahlung < 0); the rest are non-negative. */
  readonly signiert: boolean
  readonly vergleichbar: boolean
}

export const BESCHEID_FELDER: readonly BescheidFeldDef[] = [
  { id: 'einnahmen', signiert: false, vergleichbar: true },
  { id: 'vorsorgeaufwand', signiert: false, vergleichbar: true },
  { id: 'anrechnung', signiert: false, vergleichbar: true },
  { id: 'festgesetzteSteuer', signiert: false, vergleichbar: false },
  { id: 'erstattung', signiert: true, vergleichbar: false },
]

/** All Bescheid field ids in paper order — the single source the API boundary validation reads. */
export const BESCHEID_FELD_IDS: readonly BescheidFeld[] = BESCHEID_FELDER.map((f) => f.id)

/** The comparable field ids only — what `gleicheBescheidAb` compares. */
export const BESCHEID_VERGLEICHBARE_FELDER: readonly BescheidBetragFeld[] = BESCHEID_FELDER.filter(
  (f): f is BescheidFeldDef & { id: BescheidBetragFeld } => f.vergleichbar,
).map((f) => f.id)

/** Sparse typed amounts; a missing key = "not yet entered" (offen). */
export type BescheidWerte = Partial<Record<BescheidFeld, number>>

// --- Abgleich (Bescheid vs. berechne) ------------------------------------------------------

/** A deviation on one of the three comparable buckets. `differenz` = bescheid − berechnet. */
export interface BescheidAbweichung {
  readonly feld: BescheidBetragFeld
  readonly bescheid: number
  readonly berechnet: number
  readonly differenz: number
}

export interface BescheidAbgleich {
  /** Deviations only (differenz !== 0). Empty = alles stimmt überein. Never silent. */
  readonly abweichungen: readonly BescheidAbweichung[]
  /** `berechne` returned 'offen' — the computed side is incomplete, stated honestly (ADR-032). */
  readonly berechnungUnvollstaendig: boolean
}

/**
 * ADR-008/032 — compare the Bescheid's entered figures against the core's `berechne` buckets.
 * Only the three COMPARABLE buckets are compared; a Bescheid field that is still offen is simply
 * not compared (no fabricated zero). Deviations are returned as a list — the UI shows them as a
 * visible diff, never a silent "passt" / "passt nicht" verdict.
 */
export function gleicheBescheidAb(werte: BescheidWerte, stand: Berechnungsstand): BescheidAbgleich {
  const abweichungen: BescheidAbweichung[] = []
  for (const feld of BESCHEID_VERGLEICHBARE_FELDER) {
    const bescheid = werte[feld]
    if (bescheid === undefined) continue
    const berechnet = stand[feld]
    if (bescheid !== berechnet) {
      abweichungen.push({ feld, bescheid, berechnet, differenz: bescheid - berechnet })
    }
  }
  return { abweichungen, berechnungUnvollstaendig: stand.kind === 'offen' }
}

/**
 * The ONE computed "berechnet" side of the Abgleich, merged from the two existing folds — the
 * Angestellte facts (`angestellteAusDaten`) and the Grenzgänger-CH fold (`grenzgaengerStand`,
 * which is already `berechne`-shaped). This merge reuses both folds' own results rather than
 * re-deriving either (ADR-014/048: one truth), and never touches berechnung.ts's formula. `ch` is
 * null when the CH vertical has no foldable stand yet (no Kurs / no status) — then only the
 * Angestellte side counts, honestly.
 */
export function bescheidBerechnungsstand(angestellte: AngestellteFakten, ch: Berechnungsstand | null): Berechnungsstand {
  const einnahmen = angestellte.einnahmen + (ch?.einnahmen ?? 0)
  const vorsorgeaufwand = ch?.vorsorgeaufwand ?? 0
  const anrechnung = ch?.anrechnung ?? 0
  const offenePosten = angestellte.offenePosten + (ch?.kind === 'offen' ? ch.offenePosten : 0)
  const konflikte = angestellte.konflikte + (ch?.kind === 'offen' ? ch.konflikte : 0)
  const gegated = [...new Set([...angestellte.gegated, ...(ch?.kind === 'offen' ? ch.gegated : [])])]
  const offen = offenePosten > 0 || konflikte > 0 || gegated.length > 0
  return offen
    ? { kind: 'offen', einnahmen, vorsorgeaufwand, anrechnung, offenePosten, konflikte, gegated }
    : { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
}

// --- Korrektur VOR Bescheid (Produkt-ADR-009) ---------------------------------------------

/**
 * An IMMUTABLE snapshot of a submitted filing — the "Fassung" (Glossar). Fassung n stays
 * unveränderlich sichtbar; a Korrektur produces Fassung n+1, never mutates n.
 */
export interface Fassung {
  readonly nummer: number
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
}

export type FassungsFeld = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'

/** A single correction to apply to the eingereichte Fassung. */
export interface FassungsKorrektur {
  readonly feld: FassungsFeld
  readonly neuerBetrag: number
}

export interface FassungsAbweichung {
  readonly feld: FassungsFeld
  readonly vorher: number
  readonly nachher: number
  /** nachher − vorher. */
  readonly differenz: number
}

export interface KorrekturErgebnis {
  /** Fassung n+1 — a COPY of the eingereichte Fassung with the corrections applied. */
  readonly fassung: Fassung
  /** The changed fields only, as a diff (ADR-009: jede Abweichung zur Vorfassung wird markiert). */
  readonly abweichungen: readonly FassungsAbweichung[]
}

/**
 * ADR-009 — "Korrigieren" copies the EINGEREICHTE Fassung (not the working state) and applies
 * the corrections to that snapshot. Fassung n is never mutated (we spread); only the corrected
 * fields are reported as a diff. Throws on a negative amount (the figures are whole-euro, >= 0).
 */
export function korrigiereFassung(vorfassung: Fassung, korrekturen: readonly FassungsKorrektur[]): KorrekturErgebnis {
  // A mutable working copy of the EINGEREICHTE Fassung (the spread copies n, never mutates it);
  // the result is returned as the immutable `Fassung` shape. Fassung n stays unveränderlich.
  const fassung: { nummer: number; einnahmen: number; vorsorgeaufwand: number; anrechnung: number } = {
    ...vorfassung,
    nummer: vorfassung.nummer + 1,
  }
  const abweichungen: FassungsAbweichung[] = []
  for (const k of korrekturen) {
    if (!Number.isInteger(k.neuerBetrag) || k.neuerBetrag < 0) {
      throw new RangeError(`korrektur: neuerBetrag must be a non-negative integer`)
    }
    const vorher = fassung[k.feld]
    fassung[k.feld] = k.neuerBetrag
    if (vorher !== k.neuerBetrag) {
      abweichungen.push({ feld: k.feld, vorher, nachher: k.neuerBetrag, differenz: k.neuerBetrag - vorher })
    }
  }
  return { fassung, abweichungen }
}

// --- Einspruch NACH Bescheid (Produkt-ADR-009, § 355 AO) ----------------------------------

/** The closed Einspruch-Gründe the UI offers (ADR-009: Grund-Auswahl, not free text). */
export const EINSPRUCHS_GRUENDE = ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'] as const

export type EinspruchGrund = (typeof EINSPRUCHS_GRUENDE)[number]

/** Total over `string`: is `value` a declared EinspruchGrund? (mirrors isBelegart/isEinkunftsart). */
export function istEinspruchGrund(value: string): value is EinspruchGrund {
  return (EINSPRUCHS_GRUENDE as readonly string[]).includes(value)
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate() // day 0 of month+1 = last day of month
}

/**
 * § 355 AO — the Einspruchsfrist is one month from Bekanntgabe (here: the Bescheiddatum). Adds
 * one month, clamping the day to the target month's last day when the source day doesn't exist
 * there (31.01 → 28/29.02). Returns an ISO yyyy-mm-dd. Throws on a malformed date — the
 * Bescheiddatum is a fact, not a free string.
 */
export function einspruchsfristEnde(bescheiddatum: string): string {
  const m = ISO_DATE_RE.exec(bescheiddatum)
  if (m === null) throw new RangeError(`einspruchsfristEnde: "${bescheiddatum}" is not an ISO yyyy-mm-dd date`)
  const jahr = Number(m[1]!)
  const monat = Number(m[2]!)
  const tag = Number(m[3]!)
  const zielJahr = monat === 12 ? jahr + 1 : jahr
  const zielMonat = monat === 12 ? 1 : monat + 1
  const zielTag = Math.min(tag, tageImMonat(zielJahr, zielMonat))
  const mm = String(zielMonat).padStart(2, '0')
  const tt = String(zielTag).padStart(2, '0')
  return `${zielJahr}-${mm}-${tt}`
}

function tageSeit(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

/**
 * Whole days from `heute` (exclusive) to the Einspruchsfrist end. Negative = the frist is already
 * abgelaufen. Both dates are ISO yyyy-mm-dd (locale-independent, like werktage.ts).
 */
export function verbleibendeEinspruchstage(bescheiddatum: string, heute: string): number {
  const ende = tageSeit(einspruchsfristEnde(bescheiddatum))
  const start = tageSeit(heute)
  return ende - start
}

// --------------------------------------------------------------------------------------------
// Persistence encoding — the one place the "offen / unklar / erfasst" states map to a stored
// string (ADR-0033's one-rule instinct, same as lstb.ts/grenzgaenger.ts), so the API repository
// and its tests cannot drift from each other. `null` = offen, the reserved marker = unklar, any
// other string = a whole-euro amount (`erfasst`). `erstattung` is the one signed field.
// --------------------------------------------------------------------------------------------

/** The reserved stored value for a field the user looked at and could not read ("unklar"). */
export const BESCHEID_UNKLAR = 'unklar'

/** Is `wert` a valid amount for `feld`? (signiert only for `erstattung`). */
export function istGueltigerBescheidBetrag(feld: BescheidFeld, wert: number): boolean {
  if (!Number.isInteger(wert)) return false
  const def = BESCHEID_FELDER.find((f) => f.id === feld)
  return def?.signiert === true ? Number.isFinite(wert) : wert >= 0
}

/** A field state → its stored string (`null` for `offen`). */
export function serialisiereBescheidFeld(feld: BescheidFeld, wert: number | null | typeof BESCHEID_UNKLAR): string | null {
  if (wert === null) return null
  if (wert === BESCHEID_UNKLAR) return BESCHEID_UNKLAR
  if (!istGueltigerBescheidBetrag(feld, wert)) {
    throw new RangeError(`bescheid: erfasst value for "${feld}" is not a valid whole-euro amount`)
  }
  return String(wert)
}

/** A stored string → the field's value (`null` = offen, the marker = unklar, else an amount). */
export function deserialisiereBescheidFeld(feld: BescheidFeld, value: string | null): number | null | typeof BESCHEID_UNKLAR {
  if (value === null) return null
  if (value === BESCHEID_UNKLAR) return BESCHEID_UNKLAR
  const wert = Number(value)
  if (!istGueltigerBescheidBetrag(feld, wert)) {
    throw new Error(`bescheid: stored value "${value}" for "${feld}" is neither offen, unklar, nor a valid amount`)
  }
  return wert
}
