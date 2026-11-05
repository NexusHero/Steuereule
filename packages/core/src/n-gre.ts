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
  /** Employer share of the Kollektivkrankentaggeld premium in percent (0–100); absent = 0. */
  readonly krankentaggeldArbeitgeberProzent?: number | undefined
  /** Employer contribution in CHF — only needed when the employer pays everything, so nothing can be derived. */
  readonly krankentaggeldArbeitgeberChf?: number | undefined
  /** Employer share of the NBUV premium in percent (0–100); absent = 0. */
  readonly nbuvArbeitgeberProzent?: number | undefined
  readonly nbuvArbeitgeberChf?: number | undefined
}

export type NGreZeile =
  | 'z6' | 'z8' | 'z15' | 'z18' | 'z19' | 'z23' | 'z25'
  | 'z75' | 'z76' | 'z77' | 'z78' | 'z79' | 'z80' | 'z81' | 'z82'
  | 'z83' | 'z84' | 'z85' | 'z86' | 'z87' | 'z88'

/** Who pays a premium (N-Gre Zeilen 95/96 for Krankentaggeld, 97/98 for NBUV) — percent and CHF. */
export interface PraemienAufteilung {
  readonly arbeitgeberProzent: number
  readonly arbeitnehmerProzent: number
  readonly arbeitgeberChf: number
  readonly arbeitnehmerChf: number
}

export interface NGreBetraege {
  readonly chf: Readonly<Record<NGreZeile, number>>
  readonly eur: Readonly<Record<NGreZeile, number>>
  readonly aufteilung: { readonly krankentaggeld: PraemienAufteilung; readonly nbuv: PraemienAufteilung }
}

/**
 * The employer's part of a premium the employee pays the rest of. With 100 % the employee part is 0 and
 * nothing can be derived — then the given CHF amount is used.
 */
function aufteilung(arbeitnehmerChf: number, prozent: number | undefined, arbeitgeberChfGegeben: number | undefined): PraemienAufteilung {
  const arbeitgeberProzent = Math.min(100, Math.max(0, prozent ?? 0))
  const arbeitgeberChf =
    arbeitgeberChfGegeben !== undefined
      ? arbeitgeberChfGegeben
      : arbeitgeberProzent === 0 || arbeitgeberProzent === 100
        ? 0
        : Math.round((arbeitnehmerChf * arbeitgeberProzent) / (100 - arbeitgeberProzent))
  return { arbeitgeberProzent, arbeitnehmerProzent: 100 - arbeitgeberProzent, arbeitgeberChf, arbeitnehmerChf }
}

export function anlageNGreBetraege(e: NGreEingabe): NGreBetraege {
  const basis = e.bruttolohnChf - e.familienzulagenChf
  const ahv = Math.round(basis * AHV_IV)
  const eo = Math.round(basis * EO)
  const alv = Math.round(Math.min(basis, ALV_HOECHSTBETRAG_CHF) * ALV)
  const nbuvArbeitnehmer = Math.max(0, e.ahvBeitraegeChf - ahv - eo - alv)
  const krankentaggeld = aufteilung(e.krankentaggeldChf, e.krankentaggeldArbeitgeberProzent, e.krankentaggeldArbeitgeberChf)
  const nbuv = aufteilung(nbuvArbeitnehmer, e.nbuvArbeitgeberProzent, e.nbuvArbeitgeberChf)

  const teile = {
    z6: e.bruttolohnChf,
    z8: e.familienzulagenChf,
    // The employer's premiums are taxable wage (Z. 18/19, "vgl. Zeile 80/81") and therefore also count
    // as the employee's contributions in Z. 80/81.
    z18: krankentaggeld.arbeitgeberChf,
    z19: nbuv.arbeitgeberChf,
    z25: Math.min(e.quellensteuerChf, Math.round(e.bruttolohnChf * ABZUGSSTEUER_HOECHSTSATZ)),
    z78: eo,
    z79: alv,
    z80: krankentaggeld.arbeitnehmerChf + krankentaggeld.arbeitgeberChf,
    z81: Math.round((nbuv.arbeitnehmerChf + nbuv.arbeitgeberChf) / 2),
    z83: ahv,
    z84: e.pkArbeitnehmerChf,
    z87: e.pkArbeitgeberChf,
  }
  const summen = (t: typeof teile): Record<NGreZeile, number> => ({
    ...t,
    z15: t.z6 - t.z8,
    z23: t.z6 - t.z8 + t.z18 + t.z19,
    z75: t.z6,
    z76: t.z8,
    z77: t.z6 - t.z8,
    z82: t.z78 + t.z79 + t.z80 + t.z81,
    z85: t.z83 + t.z84,
    z86: t.z83,
    z88: t.z83 + t.z87,
  })
  const inEur = Object.fromEntries(Object.entries(teile).map(([zeile, chf]) => [zeile, Math.round(chf * e.kurs)])) as typeof teile
  return { chf: summen(teile), eur: summen(inEur), aufteilung: { krankentaggeld, nbuv } }
}
