export interface PartnerCouplingRecord {
  id: string
  personAUserId: string
  personBUserId: string
  taxYear: number
  filingType: 'einzel' | 'zusammen'
  invitationCode: string | null
  invitationCodeValidUntil: Date | null
  /** When Person B (own account) agreed to share this year with A (decision 3, API-3); null while not. */
  personBConsentedAt?: Date | null
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
      personBConsentedAt?: Date | null
    },
  ): Promise<PartnerCouplingRecord>
  /**
   * Redeems an invitation code for Person B, atomically (API-8): of two accounts redeeming the same code at once,
   * exactly one gets the row; the other gets null. The redemption is B's consent for that year.
   */
  claimInvitation(code: string, taxYear: number, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null>
  /** Person B agrees to share this year with A (decision 3). */
  recordPersonBConsent(id: string, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null>
  delete(personAUserId: string, taxYear: number): Promise<boolean>
}
