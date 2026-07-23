// The read seam for the caller's better-auth account identity (User + Account rows).
// Mirrors profile.repository.ts's interface-by-token pattern so unit tests can swap in
// a fake. Deliberately narrow — only the fields REQ-011's export document needs
// (ADR-0013's frozen contract): never the password hash (Account.password), never a
// session/verification token, never another user's row.
export interface AccountIdentity {
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  /** Distinct provider ids across every Account row linked to this User, e.g. ["credential"]. */
  authProviders: string[]
}

export const ACCOUNT_IDENTITY_REPOSITORY = Symbol('ACCOUNT_IDENTITY_REPOSITORY')

export interface AccountIdentityRepository {
  /** null when `userId` has no better-auth User row — a guest session that never signed up. */
  findByUserId(userId: string): Promise<AccountIdentity | null>
}
