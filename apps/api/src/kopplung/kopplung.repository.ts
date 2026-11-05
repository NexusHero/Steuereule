export interface PartnerCouplingRecord {
  id: string
  personAUserId: string
  personBUserId: string
  steuerjahr: number
  taxYear?: number
  veranlagungsart: 'einzel' | 'zusammen'
  assessmentType?: 'single' | 'joint' | 'einzel' | 'zusammen'
  einladungsCode: string | null
  invitationCode?: string | null
  einladungsCodeGueltigBis: Date | null
  invitationCodeExpiresAt?: Date | null
}
export type SteuerjahrKopplungRecord = PartnerCouplingRecord

export const PARTNER_COUPLING_REPOSITORY = Symbol('PARTNER_COUPLING_REPOSITORY')
export const KOPPLUNG_REPOSITORY = PARTNER_COUPLING_REPOSITORY

export interface PartnerCouplingRepository {
  findByUserAndYear(userId: string, steuerjahr: number): Promise<PartnerCouplingRecord | null>
  findByEinladungsCode(code: string): Promise<PartnerCouplingRecord | null>
  upsert(
    personAUserId: string,
    steuerjahr: number,
    data: {
      personBUserId: string
      veranlagungsart: 'einzel' | 'zusammen'
      einladungsCode?: string | null
      einladungsCodeGueltigBis?: Date | null
    },
  ): Promise<PartnerCouplingRecord>
  setPersonB(id: string, personBUserId: string): Promise<PartnerCouplingRecord>
  delete(personAUserId: string, steuerjahr: number): Promise<boolean>
}
export type KopplungRepository = PartnerCouplingRepository
