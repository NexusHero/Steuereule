export interface KindRecord {
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
    },
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
    },
  ): Promise<KindRecord | null>
  delete(userId: string, steuerjahr: number, id: string): Promise<boolean>
}
