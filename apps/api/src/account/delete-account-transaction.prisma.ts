import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import type { DeleteAccountResult } from './account-deletion.repository.js'

export type { DeleteAccountResult }

export interface DeleteAccountTestHooks {
  simulateFailureAfterProfileStep?: () => void
}

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

interface UserKeyedTable {
  count(args: { where: { userId: string } }): Promise<number>
  deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>
}

export function taxDataTables(tx: TransactionClient): UserKeyedTable[] {
  return [
    tx.taxYear,
    tx.interviewAnswer,
    tx.receiptFile,
    tx.receipt,
    tx.lstb,
    tx.chSalaryCertificate,
    tx.pension,
    tx.capital,
    tx.commute,
    tx.rentalProperty,
    tx.assessment,
    tx.filingVersion,
    tx.marking,
    tx.yearTakeover,
    tx.masterData,
    tx.child,
    tx.owlSetting,
    tx.owlCardDismissal,
    tx.owlPersonalDataConsent,
    tx.advisorChatMessage,
    // After its messages: they reference the conversation (#481).
    tx.advisorConversation,
    tx.advisorNote,
    tx.advisorSituation,
    tx.advisorInterview,
    tx.assistantTask,
    // ADR-0101: lines before their entries, entries, log and bank transactions before their book (FKs).
    // The append-only trigger lets these deletes through only under ERASURE_SETTING (see below).
    tx.journalLine,
    tx.journalEntry,
    tx.ledgerLogRecord,
    tx.bankTransaction,
    tx.ledger,
    tx.fixedAsset,
    tx.bookingRule,
    tx.payrollRun,
    tx.businessProfile,
  ]
}

/**
 * The transaction-local setting the append-only trigger of migration 20261120100000_self_employment
 * checks: only with it on may a journal entry, its lines, the log or the book be deleted. Art. 17
 * DSGVO wins over the GoBD retention for the app's copy; it is set only here, inside the erasure.
 */
export const ERASURE_SETTING = 'steuereule.erasure'

/** Turns the erasure flag on for the rest of this transaction only (`set_config(…, true)`). */
export async function allowErasure(tx: Pick<TransactionClient, '$executeRaw'>): Promise<void> {
  await tx.$executeRaw`SELECT set_config(${ERASURE_SETTING}, 'on', true)`
}

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

    if (heldResources.has('taxData')) {
      for (const table of taxDataTables(tx)) {
        retainedUnderLegalHold += await table.count({ where: { userId } })
      }
    } else {
      await allowErasure(tx)
      for (const table of taxDataTables(tx)) {
        await table.deleteMany({ where: { userId } })
      }
      await tx.taxYearLink.deleteMany({
        where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] },
      })
      // ADR-0062: the household, its yearly memberships (cascade) and the spouse link.
      await tx.householdMergeCandidate.deleteMany({ where: { householdUserId: userId } })
      await tx.householdPerson.deleteMany({ where: { householdUserId: userId } })
      await tx.partnerLink.deleteMany({ where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] } })
    }
    await tx.deviceCode.deleteMany({ where: { userId } })

    let retainedAnonymisedAuditRows = 0
    if (heldResources.has('auditLog')) {
      retainedUnderLegalHold += await tx.taxDataAccessLog.count({ where: { userId } })
    } else {
      const tombstone = `deleted:${randomUUID()}`
      const { count } = await tx.taxDataAccessLog.updateMany({ where: { userId }, data: { userId: tombstone } })
      retainedAnonymisedAuditRows = count
    }

    if (user) {
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
