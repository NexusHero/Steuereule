// The persistence seam for account teardown (ADR-0013). Mirrors
// profile.repository.ts/audit.repository.ts's interface-by-token pattern so unit
// (fake-repository) tests can swap in an in-memory fake, but exposes strictly one
// operation — deleteAccount() — the whole point being that no caller composes the
// individual Profile/TaxDataAccessLog/User steps themselves; only this seam runs the
// real atomic transaction (see delete-account-transaction.ts).
import type { DeleteAccountResult } from './delete-account-transaction.js'

export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY')

export interface AccountDeletionRepository {
  /** Runs the full account-teardown transaction for this userId. Idempotent in the
   *  sense that a retry against an already-deleted account is a safe no-op (`user`
   *  lookup just finds nothing to delete) — never throws for "nothing left to do". */
  deleteAccount(userId: string): Promise<DeleteAccountResult>
}
