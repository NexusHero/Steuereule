export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY')

/** Rows a legal hold kept back, per held resource ("unlock", "filingVersion", or an operator's category hold). */
export interface RetainedHold {
  resource: string
  count: number
  /** ISO time the hold ends; the lifecycle sweep deletes the rows after it. */
  until: string
  reason: string | null
}

export interface DeleteAccountResult {
  deleted: {
    profile: boolean
    account: true
  }
  retainedAnonymisedAuditRows: number
  retainedUnderLegalHold: number
  legalHolds: RetainedHold[]
}

/** The persistence seam for account teardown. */
export interface AccountDeletionRepository {
  deleteAccount(userId: string): Promise<DeleteAccountResult>
  /**
   * ADR-0030: erases a never-verified account, or nothing when it was verified meanwhile (null). The keys are
   * destroyed only after the rows are gone, so a verification that wins the race keeps its receipt files.
   */
  deleteUnverifiedAccount(userId: string): Promise<DeleteAccountResult | null>
}
