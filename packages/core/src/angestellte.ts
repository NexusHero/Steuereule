import type { Answers } from './interview'
import { gatedEinkunftsarten, type Einkunftsart } from './einkunftsarten'
import { lstbZustand, type LstbDaten } from './lstb'
import { abziehbareBasisvorsorge, krankenversicherungAusAntworten } from './krankenversicherung'

/** The interview-catalogue-derived figures for the Angestellte case, already categorised into where they belong in the fold. */
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

function intAus(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function angestellteAusAntworten(answers: Answers): AngestellteAntwortZahlen {
  const nebenjob = answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob' ? intAus(answers['nebenjob-brutto']) : 0
  return {
    nebenjobBrutto: nebenjob,
    umzugKosten: answers.umzug === 'Ja' ? intAus(answers['umzug-kosten']) : 0,
    spenden: answers.spenden === 'Ja' ? intAus(answers['spenden-betrag']) : 0,
    kvPvBeitraege: abziehbareBasisvorsorge(krankenversicherungAusAntworten(answers)),
    riester: answers.riester === 'Ja' ? intAus(answers['riester-betrag']) : 0,
    dhfMiete: answers.dhf === 'Ja' ? intAus(answers['dhf-miete']) : 0,
    abfindungBetrag: answers.abfindung === 'Ja' ? intAus(answers['abfindung-betrag']) : 0,
    lohnersatzBetrag: answers.lohnersatz === 'Ja' ? intAus(answers['lohnersatz-betrag']) : 0,
  }
}

/** The already-summed inputs to the fold. */
export interface AngestellteEingaben {
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly sonderausgaben: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly Einkunftsart[]
}

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

/** The ONE fold from the readable Angestellte facts → every numeric input both the Cockpit spanne AND the Plausibilitäts-Prüfung need. */
export interface AngestellteFakten {
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly sonderausgaben: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly Einkunftsart[]
  readonly erfasstNichtGerechnet: number
}

export function angestellteAusDaten(daten: LstbDaten, answers: Answers): AngestellteFakten {
  const zahlen = angestellteAusAntworten(answers)
  const zustand = lstbZustand(daten)
  const angestellt = answers.job === 'Angestellt' || answers.job === 'Beides'

  const einnahmen =
    (angestellt && daten.bruttoarbeitslohn.kind === 'erfasst' ? daten.bruttoarbeitslohn.wert : 0) + zahlen.nebenjobBrutto

  const offeneLstb =
    angestellt && zustand.kind === 'unvollstaendig' ? zustand.offen.length + zustand.unklar.length : 0
  const nebenjobOffen =
    (answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob') && zahlen.nebenjobBrutto === 0
  const offenePosten = offeneLstb + (nebenjobOffen ? 1 : 0)

  return {
    einnahmen,
    werbungskosten: zahlen.umzugKosten,
    sonderausgaben: zahlen.spenden + zahlen.kvPvBeitraege + zahlen.riester,
    offenePosten,
    konflikte: angestellt && zustand.kind === 'widerspruch' ? zustand.widersprueche.length : 0,
    gegated: gatedEinkunftsarten(answers),
    erfasstNichtGerechnet: zahlen.dhfMiete + zahlen.abfindungBetrag + zahlen.lohnersatzBetrag,
  }
}
