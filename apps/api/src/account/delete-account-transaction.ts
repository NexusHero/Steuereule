import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export interface DeleteAccountResult {
  deleted: {
    profile: boolean
    account: true
  }
  retainedAnonymisedAuditRows: number
  retainedUnderLegalHold: number
}

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
    tx.beleg,
    tx.lstb,
    tx.chLohnausweis,
    tx.rente,
    tx.kapital,
    tx.vermietungsobjekt,
    tx.bescheid,
    tx.kennzeichnung,
    tx.jahresuebernahme,
    tx.stammdaten,
    tx.kind,
    tx.eulenEinstellung,
    tx.eulenKartenVerwurf,
  ]
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
      for (const table of taxDataTables(tx)) {
        await table.deleteMany({ where: { userId } })
      }
      await tx.steuerjahrKopplung.deleteMany({
        where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] },
      })
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
