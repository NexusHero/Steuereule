export interface AccountIdentity {
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  /** When the ADR-0030 warning of a never-verified account went out; null before. */
  unverifiedWarningSentAt?: Date | null
  authProviders: string[]
}

export const ACCOUNT_IDENTITY_REPOSITORY = Symbol('ACCOUNT_IDENTITY_REPOSITORY')

/** The read seam for the caller's better-auth account identity. */
export interface AccountIdentityRepository {
  findByUserId(userId: string): Promise<AccountIdentity | null>
}
