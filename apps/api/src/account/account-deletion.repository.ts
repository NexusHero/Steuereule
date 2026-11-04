import type { DeleteAccountResult } from './delete-account-transaction.js'

export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY')

/** The persistence seam for account teardown. */
export interface AccountDeletionRepository {
  deleteAccount(userId: string): Promise<DeleteAccountResult>
}
