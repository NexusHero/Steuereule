const AHV_IV = 0.0505
const EO = 0.0025
const ALV = 0.011
const ALV_HOECHSTBETRAG_CHF = 148200
const ABZUGSSTEUER_HOECHSTSATZ = 0.045

/** The CHF facts from the Lohnausweis and the Vorsorgeausweis, plus the EUR-per-CHF Kurs. */
export interface NGreEingabe {
  readonly bruttolohnChf: number
  readonly familienzulagenChf: number
  readonly ahvBeitraegeChf: number
  readonly quellensteuerChf: number
  readonly krankentaggeldChf: number
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
