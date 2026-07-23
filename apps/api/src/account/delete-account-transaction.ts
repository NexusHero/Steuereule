// The atomic account-teardown transaction at the heart of REQ-011/ADR-0013 §3.
// Exported as a raw function — separate from any Nest wiring — exactly mirroring
// guest-account-upgrade.ts's `upgradeGuestToAccount`: directly testable without going
// through the HTTP/DI machinery, and reused unchanged by AccountDeletionRepository.
//
// Uses the *plain* (non-field-encryption-extended) Prisma client deliberately (ADR-0013
// §3): this only ever hard-deletes/updates rows and re-keys the audit `userId`, never
// reads/writes the encrypted steuerId/steuernummer fields, so it needs none of
// prisma-field-encryption's decrypt/re-encrypt machinery.
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export interface DeleteAccountResult {
  deleted: {
    /** False when an active LegalHold on the "profile" resource exempted it — the row
     *  still exists, retained under legal obligation (ADR-0013 §5). */
    profile: boolean
    /** Always true: the better-auth account (User, cascading Session/Account) plus its
     *  Verification rows are torn down unconditionally — LegalHold only ever exempts
     *  tax-data-adjacent rows (Profile, TaxDataAccessLog), never login/identity itself
     *  (ADR-0013's frozen contract types this literally as `true`). */
    account: true
  }
  /** Count of TaxDataAccessLog rows anonymised (userId severed to an irreversible
   *  tombstone) in this call — the Art. 30 accountability record, retained but no
   *  longer person-linkable (ADR-0013 §1, ADR-0012 §4's sanctioned re-key exception). */
  retainedAnonymisedAuditRows: number
  /** Count of rows retained *untouched* (neither erased nor anonymised) because an
   *  active LegalHold exempted them (ADR-0013 §5). Zero whenever no hold applies —
   *  which is every real user today, since no filing/tax-year Löschschutz model
   *  persists yet; the mechanism is still real and this is what proves it. */
  retainedUnderLegalHold: number
}

export interface DeleteAccountTestHooks {
  /**
   * Test-only injection point, called mid-transaction after the Profile step and
   * before the audit-anonymisation/account-teardown steps. Never set by production
   * callers (AccountDeletionRepository never passes it) — its sole purpose is the REQ-011
   * atomicity/rollback ATDD case: throwing here proves a genuine mid-transaction
   * failure rolls back everything already run against `tx` in this same call,
   * including the Profile deletion just above it, not merely the step that failed.
   */
  simulateFailureAfterProfileStep?: () => void
}

/**
 * Tears down a user's account in one Prisma `$transaction` — all-or-nothing (ADR-0013
 * §3). Consults `LegalHold` first; a hold on "profile" exempts the Profile row from
 * hard-delete, a hold on "auditLog" exempts that user's TaxDataAccessLog rows from
 * anonymisation. The better-auth `User` row (cascading Session/Account) and its
 * `Verification` rows are always deleted — LegalHold never exempts login/identity
 * itself, only tax-data-adjacent rows (ADR-0013's frozen contract).
 */
export async function deleteAccountTransaction(
  prisma: PrismaClient,
  userId: string,
  hooks: DeleteAccountTestHooks = {},
): Promise<DeleteAccountResult> {
  return prisma.$transaction(async (tx) => {
    const now = new Date()
    const [user, activeHolds] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.legalHold.findMany({ where: { userId, holdUntil: { gt: now } } }),
    ])
    const heldResources = new Set(activeHolds.map((hold) => hold.resource))

    let retainedUnderLegalHold = 0

    let profileDeleted = false
    if (heldResources.has('profile')) {
      retainedUnderLegalHold += await tx.profile.count({ where: { userId } })
    } else {
      const { count } = await tx.profile.deleteMany({ where: { userId } })
      profileDeleted = count > 0
    }

    hooks.simulateFailureAfterProfileStep?.()

    let retainedAnonymisedAuditRows = 0
    if (heldResources.has('auditLog')) {
      retainedUnderLegalHold += await tx.taxDataAccessLog.count({ where: { userId } })
    } else {
      // Sanctioned append-only exception (ADR-0012 §4, extended by ADR-0013 §1): this
      // UPDATE severs the userId link to an irreversible tombstone — the immutable
      // Art. 30 event (action/resource/createdAt) is retained, but is no longer
      // personal data once unlinkable (DSGVO Recital 26). Any future DB-level
      // append-only enforcement must whitelist this path alongside the guest re-key.
      const tombstone = `deleted:${randomUUID()}`
      const { count } = await tx.taxDataAccessLog.updateMany({ where: { userId }, data: { userId: tombstone } })
      retainedAnonymisedAuditRows = count
    }

    if (user) {
      // better-auth's own canonical shape: Verification rows are keyed by `identifier`
      // (the account email), not a userId FK — deleted explicitly since there is no
      // cascade to rely on here (unlike Session/Account, which cascade off User).
      await tx.verification.deleteMany({ where: { identifier: user.email } })
      await tx.user.delete({ where: { id: userId } })
    }

    return {
      deleted: { profile: profileDeleted, account: true },
      retainedAnonymisedAuditRows,
      retainedUnderLegalHold,
    }
  })
}
