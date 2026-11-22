export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY')

export interface DeleteAccountResult {
  deleted: {
    profile: boolean
    account: true
  }
  retainedAnonymisedAuditRows: number
  retainedUnderLegalHold: number
}

/** The persistence seam for account teardown. */
export interface AccountDeletionRepository {
  deleteAccount(userId: string): Promise<DeleteAccountResult>
}
