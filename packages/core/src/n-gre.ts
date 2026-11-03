// Anlage N-Gre (Grenzgänger Schweiz): the wage lines and the split of the Swiss social
// contributions, computed with the rates the 2025 form itself prints (Zeilen 78, 79, 83).
// Pure, no I/O (ADR-0004).

/** AHV/IV employee share (Zeile 83), EO (Zeile 78), ALV up to the ceiling (Zeile 79). */
const AHV_IV = 0.0505
const EO = 0.0025
const ALV = 0.011
const ALV_HOECHSTBETRAG_CHF = 148200
/** In der Schweiz erhobene Abzugssteuer, höchstens 4,5 % von Zeile 6 (Art. 15a DBA). */
const ABZUGSSTEUER_HOECHSTSATZ = 0.045

/** The CHF facts from the Lohnausweis and the Vorsorgeausweis, plus the EUR-per-CHF Kurs. */
export interface NGreEingabe {
  /** Lohnausweis Ziffer 8. */
  readonly bruttolohnChf: number
  /** Kinder- und Ausbildungszulagen contained in Ziffer 8 (Zeilen 8 / 76). */
  readonly familienzulagenChf: number
  /** Lohnausweis Ziffer 9 — AHV/IV/EO/ALV/NBUV together. */
  readonly ahvBeitraegeChf: number
  /** Lohnausweis Ziffer 12. */
  readonly quellensteuerChf: number
  /** Employee contributions to the Krankentaggeldversicherung (Zeile 80). */
  readonly krankentaggeldChf: number
  /** Säule 2a Obligatorium, employee and employer (Zeilen 84 / 87, Vorsorgeausweis). */
  readonly pkArbeitnehmerChf: number
  readonly pkArbeitgeberChf: number
  readonly kurs: number
}

export type NGreZeile =
  | 'z6' | 'z8' | 'z15' | 'z23' | 'z25'
  | 'z75' | 'z76' | 'z77' | 'z78' | 'z79' | 'z80' | 'z81' | 'z82'
  | 'z83' | 'z84' | 'z85' | 'z86' | 'z87' | 'z88'

export interface NGreBetraege {
  readonly chf: Readonly<Record<NGreZeile, number>>
  readonly eur: Readonly<Record<NGreZeile, number>>
}

/** The amounts per line in whole CHF and whole EUR; EUR sums are sums of the converted parts. */
export function anlageNGreBetraege(e: NGreEingabe): NGreBetraege {
  const basis = e.bruttolohnChf - e.familienzulagenChf
  const ahv = Math.round(basis * AHV_IV)
  const eo = Math.round(basis * EO)
  const alv = Math.round(Math.min(basis, ALV_HOECHSTBETRAG_CHF) * ALV)
  const nbuvHaelfte = Math.round(Math.max(0, e.ahvBeitraegeChf - ahv - eo - alv) / 2)

  const teile = {
    z6: e.bruttolohnChf,
    z8: e.familienzulagenChf,
    z25: Math.min(e.quellensteuerChf, Math.round(e.bruttolohnChf * ABZUGSSTEUER_HOECHSTSATZ)),
    z78: eo,
    z79: alv,
    z80: e.krankentaggeldChf,
    z81: nbuvHaelfte,
    z83: ahv,
    z84: e.pkArbeitnehmerChf,
    z87: e.pkArbeitgeberChf,
  }
  const summen = (t: typeof teile): Record<NGreZeile, number> => ({
    ...t,
    z15: t.z6 - t.z8,
    z23: t.z6 - t.z8,
    z75: t.z6,
    z76: t.z8,
    z77: t.z6 - t.z8,
    z82: t.z78 + t.z79 + t.z80 + t.z81,
    z85: t.z83 + t.z84,
    z86: t.z83,
    z88: t.z83 + t.z87,
  })
  const inEur = Object.fromEntries(Object.entries(teile).map(([zeile, chf]) => [zeile, Math.round(chf * e.kurs)])) as typeof teile
  return { chf: summen(teile), eur: summen(inEur) }
}
