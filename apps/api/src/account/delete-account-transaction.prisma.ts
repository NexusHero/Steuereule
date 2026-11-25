import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import type { DeleteAccountResult, RetainedHold } from './account-deletion.repository.js'
import { allowErasure } from '../personal-data/erasure.prisma.js'
import { delegateName, genericDeletionEntries, PERSONAL_DATA_REGISTRY, type DeletionStep, type PersonalDataEntry } from '../personal-data/personal-data-registry.js'
import { personIds, shadowIdOf } from '../common/person-ids.js'

export interface DeleteAccountTestHooks {
  simulateFailureAfterProfileStep?: () => void
  /**
   * ADR-0030 §4: the system-initiated erasure of a never-verified account. The "still unverified?" check and
   * the delete sit in this one transaction: the final `DELETE … WHERE emailVerified = false` re-reads the row
   * under its lock, so a verification that commits first makes it delete nothing and the whole erasure rolls back.
   */
  onlyIfUnverified?: boolean
}

/** Thrown inside the transaction (and rolling it back) when the account was verified meanwhile. */
export class AccountVerifiedMeanwhileError extends Error {
  constructor() {
    super('The account was verified while its erasure ran; nothing was deleted.')
  }
}

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

type IdWhere = { userId: { in: string[] }; id?: { notIn: string[] } | { in: string[] } }

interface UserKeyedTable {
  count(args: { where: IdWhere }): Promise<number>
  deleteMany(args: { where: IdWhere }): Promise<{ count: number }>
}

function tableOf(tx: TransactionClient, entry: PersonalDataEntry): UserKeyedTable {
  return (tx as unknown as Record<string, UserKeyedTable>)[delegateName(entry.model)]!
}

/** The tables the deletion removes row by row, in registry order (`personal-data-registry.ts`). */
export function taxDataTables(tx: TransactionClient): UserKeyedTable[] {
  return genericDeletionEntries().map((entry) => tableOf(tx, entry))
}

/** The household people a deletion of `userId` removes: the person's household and B's copies in A's (API-23). */
export function householdPersonsOfDeletion(userId: string) {
  return { OR: [{ householdUserId: userId }, { linkedUserId: userId }] }
}

/**
 * Person A keeps her coupling and her history when Person B deletes her own account (API-22): where the
 * deleted person is B, her id is replaced by A's shadow id for that year — A's return stays a joint one
 * with a Person B without an own login, whose figures A can enter again. Where the deleted person is A,
 * the rows are hers and go.
 */
async function deleteCoupling(tx: TransactionClient, userId: string): Promise<void> {
  await tx.taxYearLink.deleteMany({ where: { personAUserId: userId } })
  const asPersonB = await tx.taxYearLink.findMany({ where: { personBUserId: userId }, select: { id: true, personAUserId: true, taxYear: true } })
  for (const row of asPersonB) {
    await tx.taxYearLink.update({
      where: { id: row.id },
      data: { personBUserId: shadowIdOf(row.personAUserId, row.taxYear), invitationCode: null, invitationCodeValidUntil: null },
    })
  }
}

/**
 * ADR-0062: the person's household (people, their yearly memberships by cascade, open merge questions) and
 * the spouse link. As Person B: her facts copied into A's household (`linkedUserId`, API-23) go; A's link
 * stays and only forgets B's account.
 */
async function deleteHousehold(tx: TransactionClient, userId: string): Promise<void> {
  const persons = await tx.householdPerson.findMany({ where: householdPersonsOfDeletion(userId), select: { id: true } })
  const personIdList = persons.map((person) => person.id)
  await tx.householdMergeCandidate.deleteMany({
    where: { OR: [{ householdUserId: userId }, { personId: { in: personIdList } }, { otherPersonId: { in: personIdList } }] },
  })
  await tx.partnerLink.deleteMany({ where: { personAUserId: userId } })
  await tx.partnerLink.updateMany({ where: { personBUserId: userId }, data: { personBUserId: '' } })
  if (personIdList.length > 0) await tx.partnerLink.updateMany({ where: { spousePersonId: { in: personIdList } }, data: { spousePersonId: null } })
  await tx.householdPerson.deleteMany({ where: { id: { in: personIdList } } })
}

function summarise(holds: readonly { resource: string; holdUntil: Date; reason: string | null }[], counts: ReadonlyMap<string, number>): RetainedHold[] {
  const byResource = new Map<string, RetainedHold>()
  for (const hold of holds) {
    const count = counts.get(hold.resource) ?? 0
    if (count === 0) continue
    const known = byResource.get(hold.resource)
    const until = hold.holdUntil.toISOString()
    if (!known) byResource.set(hold.resource, { resource: hold.resource, count, until, reason: hold.reason })
    else if (known.until < until) byResource.set(hold.resource, { ...known, until })
  }
  return [...byResource.values()].sort((a, b) => a.resource.localeCompare(b.resource))
}

/** What a step of the erasure works with, and what it reports back. */
interface DeletionRun {
  readonly tx: TransactionClient
  readonly userId: string
  readonly ids: string[]
  readonly user: { readonly email: string } | null
  readonly categoryHolds: ReadonlySet<string>
  readonly hooks: DeleteAccountTestHooks
  retain(resource: string, count: number): void
  retainedAnonymisedAuditRows: number
}

/** The steps of the transaction; `keys` runs before it, in the keystore database (account-deletion.repository.prisma.ts). */
export type TransactionDeletionStep = Exclude<DeletionStep, 'keys'>

interface DeletionStepHandler {
  /** The registry models the step removes or rewrites; the registry lock compares them with the entries naming the step. */
  readonly models: readonly string[]
  run(run: DeletionRun): Promise<void>
}

/** Every named step of the registry, each handled once. A step the registry names without a handler does not compile. */
export const DELETION_STEPS: { readonly [S in TransactionDeletionStep]: DeletionStepHandler } = {
  coupling: {
    models: ['TaxYearLink'],
    run: async ({ tx, userId, categoryHolds }) => {
      if (!categoryHolds.has('taxData')) await deleteCoupling(tx, userId)
    },
  },
  household: {
    models: ['HouseholdMergeCandidate', 'HouseholdPerson', 'PartnerLink'],
    run: async ({ tx, userId, categoryHolds }) => {
      if (!categoryHolds.has('taxData')) await deleteHousehold(tx, userId)
    },
  },
  deviceCodes: {
    models: ['DeviceCode'],
    run: async ({ tx, userId }) => {
      await tx.deviceCode.deleteMany({ where: { userId } })
    },
  },
  anonymiseAudit: {
    models: ['TaxDataAccessLog'],
    run: async (run) => {
      const auditWhere = { userId: { in: run.ids } }
      if (run.categoryHolds.has('auditLog')) {
        run.retain('auditLog', await run.tx.taxDataAccessLog.count({ where: auditWhere }))
        return
      }
      const { count } = await run.tx.taxDataAccessLog.updateMany({ where: auditWhere, data: { userId: `deleted:${randomUUID()}` } })
      run.retainedAnonymisedAuditRows = count
    },
  },
  user: {
    models: ['Verification', 'User'],
    run: async ({ tx, userId, user, hooks }) => {
      if (!user) return
      await tx.verification.deleteMany({ where: { identifier: user.email } })
      if (hooks.onlyIfUnverified) {
        const { count } = await tx.user.deleteMany({ where: { id: userId, emailVerified: false } })
        if (count === 0) throw new AccountVerifiedMeanwhileError()
      } else {
        await tx.user.delete({ where: { id: userId } })
      }
    },
  },
}

/**
 * The one deletion truth (ADR-0013 §3, ADR-0030 §3): every store of the registry, in one transaction, in
 * registry order — the generic rows entry by entry, a named step once, where it first appears.
 * Rows under an active legal hold stay; the answer says which, how many, and until when.
 */
export async function deleteAccountTransaction(
  prisma: PrismaClient,
  userId: string,
  hooks: DeleteAccountTestHooks = {},
  now: Date = new Date(),
): Promise<DeleteAccountResult> {
  return prisma.$transaction(async (tx) => {
    const ids = personIds(userId, now)
    const [user, activeHolds] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.legalHold.findMany({ where: { userId: { in: ids }, holdUntil: { gt: now } } }),
    ])
    if (hooks.onlyIfUnverified && (!user || user.emailVerified)) throw new AccountVerifiedMeanwhileError()
    const categoryHolds = new Set(activeHolds.filter((hold) => hold.resourceId === null).map((hold) => hold.resource))
    const heldRowIds = (resource: string | undefined) =>
      activeHolds.filter((hold) => hold.resource === resource && hold.resourceId !== null).map((hold) => hold.resourceId!)
    const retained = new Map<string, number>()
    const run: DeletionRun = {
      tx,
      userId,
      ids,
      user,
      categoryHolds,
      hooks,
      retain: (resource, count) => retained.set(resource, (retained.get(resource) ?? 0) + count),
      retainedAnonymisedAuditRows: 0,
    }

    // Before the first delete: the book's append-only trigger lets deletes through only with it (ADR-0101).
    if (!categoryHolds.has('taxData')) await allowErasure(tx)

    let profileDeleted = false
    const stepsRun = new Set<DeletionStep>()
    for (const entry of PERSONAL_DATA_REGISTRY) {
      const { deletion } = entry
      if (deletion.kind === 'step') {
        if (deletion.step === 'keys' || stepsRun.has(deletion.step)) continue
        stepsRun.add(deletion.step)
        await DELETION_STEPS[deletion.step].run(run)
        continue
      }
      if (deletion.kind !== 'rows' && deletion.kind !== 'rowsUnlessHeld') continue
      const table = tableOf(tx, entry)
      const where: IdWhere = { userId: { in: ids } }
      if ((entry.hold === 'taxData' || entry.hold === 'profile') && categoryHolds.has(entry.hold)) {
        run.retain(entry.hold, await table.count({ where }))
        if (entry.model === 'Profile') hooks.simulateFailureAfterProfileStep?.()
        continue
      }
      if (deletion.kind === 'rowsUnlessHeld') {
        const held = heldRowIds(entry.holdResource)
        if (held.length > 0) {
          run.retain(entry.holdResource!, await table.count({ where: { userId: { in: ids }, id: { in: held } } }))
          where.id = { notIn: held }
        }
      }
      const { count } = await table.deleteMany({ where })
      if (entry.model === 'Profile') {
        profileDeleted = count > 0
        hooks.simulateFailureAfterProfileStep?.()
      }
    }

    return {
      deleted: { profile: profileDeleted, account: true },
      retainedAnonymisedAuditRows: run.retainedAnonymisedAuditRows,
      retainedUnderLegalHold: [...retained.values()].reduce((sum, count) => sum + count, 0),
      legalHolds: summarise(activeHolds, retained),
    }
  })
}
