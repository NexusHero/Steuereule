export interface SteuerjahrKopplungRecord {
  id: string
  personAUserId: string
  personBUserId: string
  steuerjahr: number
  veranlagungsart: 'einzel' | 'zusammen'
  einladungsCode: string | null
}

export const KOPPLUNG_REPOSITORY = Symbol('KOPPLUNG_REPOSITORY')

export interface KopplungRepository {
  findByUserAndYear(userId: string, steuerjahr: number): Promise<SteuerjahrKopplungRecord | null>
  findByEinladungsCode(code: string): Promise<SteuerjahrKopplungRecord | null>
  upsert(
    personAUserId: string,
    steuerjahr: number,
    data: {
      personBUserId: string
      veranlagungsart: 'einzel' | 'zusammen'
      einladungsCode?: string | null
    },
  ): Promise<SteuerjahrKopplungRecord>
  setPersonB(id: string, personBUserId: string): Promise<SteuerjahrKopplungRecord>
  delete(personAUserId: string, steuerjahr: number): Promise<boolean>
}
