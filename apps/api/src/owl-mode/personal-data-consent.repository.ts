/** ADR-0091: whether and when the user consented that personal data may go to the owl's model. */
export interface PersonalDataConsentRecord {
  userId: string
  /** The consent text agreed to (`OWL_PERSONAL_DATA_CONSENT_VERSION`). */
  version: string
  grantedAt: Date
  revokedAt: Date | null
}

export const PERSONAL_DATA_CONSENT_REPOSITORY = Symbol('PERSONAL_DATA_CONSENT_REPOSITORY')

export interface PersonalDataConsentRepository {
  findByUserId(userId: string): Promise<PersonalDataConsentRecord | null>
  grant(userId: string, version: string, at: Date): Promise<PersonalDataConsentRecord>
  revoke(userId: string, at: Date): Promise<PersonalDataConsentRecord | null>
}
