/** What Anlage Kind needs beyond the child's identity. */
export interface ChildDetails {
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
  kvBasisEur: string | null
  pvEur: string | null
  schweizerKinderzulageEur: string | null
}

export interface ChildRecord extends ChildDetails {
  id: string
  userId: string
  steuerjahr: number
  taxYear?: number
  lfdNr: number
  vorname: string
  firstName?: string
  nachname: string
  lastName?: string
  geburtsdatum: string
  birthDate?: string
  idnr: string | null
  kindergeldAnspruchEur: string | null
}

export const CHILD_REPOSITORY = Symbol('CHILD_REPOSITORY')

/** What Anlage Kind needs beyond the child's identity. */
export interface ChildRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<ChildRecord[]>
  create(
    userId: string,
    steuerjahr: number,
    data: {
      vorname: string
      nachname: string
      geburtsdatum: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord>
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
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord | null>
  delete(userId: string, steuerjahr: number, id: string): Promise<boolean>
}
