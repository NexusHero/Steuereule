// Angestellte-Vertikale — the deterministic fold (ticket 08). This is the "eine Wahrheit" for the
// Angestellte case: the Cockpit's real figures come from here, folded through the SAME core the
// interview/Beleg slices already use (ADR-014/048 determinism boundary), never a second calc path
// in the API or the client. It folds the captured facts — LStB Brutto, the Arbeitstage-derived
// Pendlerpauschale, the Lebenslagen amounts and the Sonderausgaben — into Einnahmen, Werbungskosten
// and Sonderausgaben, and reports either a determined "Einkünfte" figure or an honest `offen`
// result naming what stands in the way (open inputs, conflicts, gated Einkunftsarten) — the exact
// shape berechnung.ts's `Berechnungsstand` establishes one level up.
//
// The tax FORMULAS are deliberately NOT here (same honesty as berechnung.ts's header): the tariff,
// the Sonderausgaben aggregation against the Einkünfte, the Fünftelregelung (Abfindung) and the
// Progressionsvorbehalt (Lohnersatz) are later slices. This module folds only what is captured AND
// foldable; Abfindung/Lohnersatz/DHF-Miete are captured but surfaced as "not yet computed", never
// silently dropped or guessed (ADR-032). Pure, deterministic, dependency-free (ADR-0004).
import type { Answers } from './interview.js'
import type { Einkunftsart } from './einkunftsarten.js'

/**
 * The interview-catalogue-derived figures for the Angestellte case, already categorised into
 * where they belong in the fold. The first five are FOLDED by the caller (summed into einnahmen /
 * werbungskosten / sonderausgaben); the last three are CAPTURED but NOT folded in this slice — DHF
 * needs annualisation (a monthly rent × months, a later formula), Abfindung needs the
 * Fünftelregelung, Lohnersatz is steuerfrei-but-progressionswirksam. They are returned so the
 * plausibility layer can surface them honestly instead of pretending they were never entered.
 */
export interface AngestellteAntwortZahlen {
  readonly nebenjobBrutto: number
  readonly umzugKosten: number
  readonly spenden: number
  readonly kvPvBeitraege: number
  readonly riester: number
  readonly dhfMiete: number
  readonly abfindungBetrag: number
  readonly lohnersatzBetrag: number
}

/**
 * A stored integer answer parses to its whole-euro value, 0 when the branch was never opened (the
 * answer is absent) — the value itself was already shape-validated by the interview engine, so a
 * present value is a well-formed base-10 integer by construction; `Number.isFinite` is defense in
 * depth, not the primary control.
 */
function intAus(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Maps the catalogue answers (Lebenslagen + Sonderausgaben) to the fold's numeric inputs. "Nein"
 * and Minijob close their branches (product ADR-031: Minijob is "nur erklären, nicht erfassen"),
 * so their amounts are 0; "Ja"/Midijob/Nebenjob open the integer follow-up and its value is read.
 */
export function angestellteAusAntworten(answers: Answers): AngestellteAntwortZahlen {
  const nebenjob = answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob' ? intAus(answers['nebenjob-brutto']) : 0
  return {
    nebenjobBrutto: nebenjob,
    umzugKosten: answers.umzug === 'Ja' ? intAus(answers['umzug-kosten']) : 0,
    spenden: answers.spenden === 'Ja' ? intAus(answers['spenden-betrag']) : 0,
    kvPvBeitraege: answers['kv-pv'] === 'Ja' ? intAus(answers['kv-pv-betrag']) : 0,
    riester: answers.riester === 'Ja' ? intAus(answers['riester-betrag']) : 0,
    dhfMiete: answers.dhf === 'Ja' ? intAus(answers['dhf-miete']) : 0,
    abfindungBetrag: answers.abfindung === 'Ja' ? intAus(answers['abfindung-betrag']) : 0,
    lohnersatzBetrag: answers.lohnersatz === 'Ja' ? intAus(answers['lohnersatz-betrag']) : 0,
  }
}

/** The already-summed inputs to the fold (whole euros, >= 0). */
export interface AngestellteEingaben {
  /** Einnahmen: LStB Bruttoarbeitslohn + Nebenjob-Brutto. */
  readonly einnahmen: number
  /** Werbungskosten: Pendlerpauschale + Umzug + manuelle Werbungskosten. */
  readonly werbungskosten: number
  /** Sonderausgaben: Spenden + KV/PV + Riester. */
  readonly sonderausgaben: number
  /** Still-unresolved inputs (open LStB fields, open catalogue branches, …). */
  readonly offenePosten: number
  /** Visible contradictions (LStB widerspruch, Arbeitstage widerspruch, …). */
  readonly konflikte: number
  /** Declared-but-not-computable Einkunftsarten (ADR-028/032/033), from `gatedEinkunftsarten`. */
  readonly gegated: readonly Einkunftsart[]
}

/**
 * The honest fold result. `bestimmt` is reachable ONLY when nothing is open, conflicting or gated;
 * otherwise `offen` names exactly what stands in the way. `einkuenfte` = Einnahmen − Werbungskosten
 * (floor 0) — the Anlage-N figure; `sonderausgaben` is reported SEPARATELY, never subtracted here,
 * because the aggregation of Sonderausgaben against the Einkünfte is a later slice's formula (the
 * same "partial truth stated as a partial truth" honesty as berechnung.ts's `offen` summe).
 */
export type AngestelltenStand =
  | { readonly kind: 'bestimmt'; readonly einnahmen: number; readonly werbungskosten: number; readonly sonderausgaben: number; readonly einkuenfte: number }
  | {
      readonly kind: 'offen'
      readonly einnahmen: number
      readonly werbungskosten: number
      readonly sonderausgaben: number
      readonly einkuenfte: number
      readonly offenePosten: number
      readonly konflikte: number
      readonly gegated: readonly Einkunftsart[]
    }

function validate(eingaben: AngestellteEingaben): void {
  for (const [name, n] of [
    ['einnahmen', eingaben.einnahmen],
    ['werbungskosten', eingaben.werbungskosten],
    ['sonderausgaben', eingaben.sonderausgaben],
    ['offenePosten', eingaben.offenePosten],
    ['konflikte', eingaben.konflikte],
  ] as const) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
}

/** Fold the captured Angestellte facts into a determined Einkünfte figure or an honest `offen` result. */
export function angestelltenStand(eingaben: AngestellteEingaben): AngestelltenStand {
  validate(eingaben)
  const einkuenfte = Math.max(0, eingaben.einnahmen - eingaben.werbungskosten)
  const offen = eingaben.offenePosten > 0 || eingaben.konflikte > 0 || eingaben.gegated.length > 0
  if (!offen) {
    return {
      kind: 'bestimmt',
      einnahmen: eingaben.einnahmen,
      werbungskosten: eingaben.werbungskosten,
      sonderausgaben: eingaben.sonderausgaben,
      einkuenfte,
    }
  }
  return {
    kind: 'offen',
    einnahmen: eingaben.einnahmen,
    werbungskosten: eingaben.werbungskosten,
    sonderausgaben: eingaben.sonderausgaben,
    einkuenfte,
    offenePosten: eingaben.offenePosten,
    konflikte: eingaben.konflikte,
    gegated: eingaben.gegated,
  }
}
