export interface PartnerCouplingRecord {
  id: string
  personAUserId: string
  personBUserId: string
  taxYear: number
  filingType: 'einzel' | 'zusammen'
  invitationCode: string | null
  invitationCodeValidUntil: Date | null
}

export const PARTNER_COUPLING_REPOSITORY = Symbol('PARTNER_COUPLING_REPOSITORY')

export interface PartnerCouplingRepository {
  findByUserAndYear(userId: string, taxYear: number): Promise<PartnerCouplingRecord | null>
  findByInvitationCode(code: string): Promise<PartnerCouplingRecord | null>
  /** Every year in which this account is person A — the household migration reads it (ADR-0062). */
  listForPersonA(personAUserId: string): Promise<PartnerCouplingRecord[]>
  upsert(
    personAUserId: string,
    taxYear: number,
    data: {
      personBUserId: string
      filingType: 'einzel' | 'zusammen'
      invitationCode?: string | null
      invitationCodeValidUntil?: Date | null
    },
  ): Promise<PartnerCouplingRecord>
  setPersonB(id: string, personBUserId: string): Promise<PartnerCouplingRecord>
  delete(personAUserId: string, taxYear: number): Promise<boolean>
}
