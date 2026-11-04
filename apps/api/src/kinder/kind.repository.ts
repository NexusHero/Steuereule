/** What Anlage Kind needs beyond the child's identity. */
export interface KindAngaben {
  kindschaftsverhaeltnis: string | null
  kindschaftsverhaeltnisB: string | null
  familienkasse: string | null
  wohnsitzInlandGanzjaehrig: boolean | null
  andererElternteil: string | null
  andererElternteilName: string | null
  andererElternteilGeburtsdatum: string | null
  andererElternteilAdresse: string | null
  andererElternteilArt: string | null
  andererElternteilVerstorbenAm: string | null
  gemeldetBeiMirGanzjaehrig: boolean | null
  kindergeldAnMichGanzjaehrig: boolean | null
}

export interface KindRecord extends KindAngaben {
  id: string
  userId: string
  steuerjahr: number
  lfdNr: number
  vorname: string
  nachname: string
  geburtsdatum: string
  idnr: string | null
  kindergeldAnspruchEur: string | null
}

export const KIND_REPOSITORY = Symbol('KIND_REPOSITORY')

/** What Anlage Kind needs beyond the child's identity. */
export interface KindRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<KindRecord[]>
  create(
    userId: string,
    steuerjahr: number,
    data: {
      vorname: string
      nachname: string
      geburtsdatum: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    } & Partial<KindAngaben>,
  ): Promise<KindRecord>
  update(
    userId: string,
    steuerjahr: number,
    id: string,
    data: {
      vorname?: string
      nachname?: string
      geburtsdatum?: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    } & Partial<KindAngaben>,
  ): Promise<KindRecord | null>
  delete(userId: string, steuerjahr: number, id: string): Promise<boolean>
}
