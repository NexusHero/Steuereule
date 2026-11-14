/** What Anlage Kind needs beyond the child's identity. */
export interface ChildDetails {
  kinship: string | null
  kinshipB: string | null
  familyBenefitsOffice: string | null
  domesticResidenceAllYear: boolean | null
  otherParent: string | null
  otherParentName: string | null
  otherParentBirthDate: string | null
  otherParentAddress: string | null
  otherParentKind: string | null
  otherParentDiedOn: string | null
  registeredWithMeAllYear: boolean | null
  childBenefitToMeAllYear: boolean | null
  healthBasicEur: string | null
  careEur: string | null
  swissFamilyAllowanceEur: string | null
  /** Anlage Kind Zeile 67 (Kz 51): childcare paid, provider, period (ADR-0076); null = not entered. */
  childcareEur?: string | null
  childcareProvider?: string | null
  childcareFrom?: string | null
  childcareTo?: string | null
  /** Who receives the Swiss Kinderzulage with their wage (ADR-0088). */
  swissFamilyAllowancePayer?: 'A' | 'B' | null
}

export interface ChildRecord extends ChildDetails {
  id: string
  userId: string
  taxYear: number
  sequenceNumber: number
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId: string | null
  childBenefitClaimEur: string | null
}

export const CHILD_REPOSITORY = Symbol('CHILD_REPOSITORY')

/** What Anlage Kind needs beyond the child's identity. */
export interface ChildRepository {
  listForUserAndYear(userId: string, taxYear: number): Promise<ChildRecord[]>
  /** Every year of the account, oldest first — the household migration reads it (ADR-0062). */
  listAllForUser(userId: string): Promise<ChildRecord[]>
  create(
    userId: string,
    taxYear: number,
    data: {
      firstName: string
      lastName: string
      geburtsdatum: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord>
  update(
    userId: string,
    taxYear: number,
    id: string,
    data: {
      firstName?: string
      lastName?: string
      geburtsdatum?: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord | null>
  delete(userId: string, taxYear: number, id: string): Promise<boolean>
}
