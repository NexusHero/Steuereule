import type { LohnausweisBetragFeldId } from '@steuereule/core'

export type ChLohnausweisFelder = Record<LohnausweisBetragFeldId, string | null>

/** The Anlage-N-Gre facts beyond the Lohnausweis. */
export interface NGreAngaben {
  arbeitgeberName: string | null
  arbeitgeberStrasse: string | null
  arbeitgeberPlzOrt: string | null
  familienzulagenChf: string | null
  krankentaggeldChf: string | null
  pkArbeitnehmerChf: string | null
  pkArbeitgeberChf: string | null
  nGreSonderfaelle: boolean | null
}

export const LEERE_N_GRE: NGreAngaben = {
  arbeitgeberName: null,
  arbeitgeberStrasse: null,
  arbeitgeberPlzOrt: null,
  familienzulagenChf: null,
  krankentaggeldChf: null,
  pkArbeitnehmerChf: null,
  pkArbeitgeberChf: null,
  nGreSonderfaelle: null,
}

export interface ChLohnausweisRecord {
  userId: string
  steuerjahr: number
  felder: ChLohnausweisFelder
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  wechselkursMonat: string | null
  wechselkursKurs: number | null
  wechselkursModus: string | null
  wechselkursBelegId: string | null
  nGre: NGreAngaben
}

export const CH_LOHNAUSWEIS_REPOSITORY = Symbol('CH_LOHNAUSWEIS_REPOSITORY')

/** The persistence seam for the CH-Lohnausweis guided mask. */
export interface ChLohnausweisRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<ChLohnausweisRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: LohnausweisBetragFeldId, wert: string | null): Promise<ChLohnausweisRecord>
  setBemerkungen(userId: string, steuerjahr: number, text: string | null): Promise<ChLohnausweisRecord>
  setVorsorge(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<ChLohnausweisRecord>
  setNGre(userId: string, steuerjahr: number, angaben: Partial<NGreAngaben>): Promise<ChLohnausweisRecord>
  setWechselkurs(
    userId: string,
    steuerjahr: number,
    wechselkurs: { monat: string; kurs: number; modus: string; belegId?: string },
  ): Promise<ChLohnausweisRecord>
}
