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

const SHADOW_ID_PREFIX = 'spouse_'

/** Person B has an account of her own (not a record A keeps under a shadow id, and not an empty slot). */
export function personBHasOwnAccount(row: Pick<PartnerCouplingRecord, 'personBUserId'>): boolean {
  return row.personBUserId !== '' && !row.personBUserId.startsWith(SHADOW_ID_PREFIX)
}

/**
 * Decision 3 (API-3): Person B with an own account agrees per tax year, in B's own app. Until then Person A
 * sees nothing of B for that year. A shadow B (no account) is A's own record and needs no consent.
 */
export function personBConsentPending(row: Pick<PartnerCouplingRecord, 'personBUserId' | 'personBConsentedAt'>): boolean {
  return personBHasOwnAccount(row) && (row.personBConsentedAt ?? null) === null
}

/**
 * The coupling as `userId` may use it to reach the other person's data (estimate, printout, submission, year
 * history, child allowances). While Person B has not agreed to the year, Person A gets the row without B: to
 * every computation the year then looks like a joint return whose second person has entered nothing yet, which
 * is all A may know. Person B, and a row with consent or a shadow B, get the row unchanged.
 *
 * Everything outside the link module reads a coupling through this (`test/person-b-consent.lock.test.ts`); only
 * `LinkService` works on the raw row, because it is what asks for and records the consent.
 */
export function couplingForDataAccess<T extends PartnerCouplingRecord>(row: T | null, userId: string): T | null {
  if (row === null) return null
  if (row.personAUserId === userId && row.filingType === 'zusammen' && personBConsentPending(row)) return { ...row, personBUserId: '' }
  return row
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
