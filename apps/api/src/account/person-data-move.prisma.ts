import { Prisma, type PrismaClient } from '@prisma/client'
import { allowErasure } from './delete-account-transaction.prisma.js'
import { delegateName, genericDeletionEntries } from './personal-data-registry.js'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

interface Table {
  count(args: { where: Record<string, unknown> }): Promise<number>
  updateMany(args: { where: Record<string, unknown>; data: { userId: string } }): Promise<{ count: number }>
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>
}

const HAS_TAX_YEAR = new Set(Prisma.dmmf.datamodel.models.filter((model) => model.fields.some((field) => field.name === 'taxYear')).map((model) => model.name))

/**
 * API-2: Person B joins A's return with an own account. What A recorded for B under the shadow id of that year
 * (`spouse_<A>_<year>`) is B's data: it moves into B's account where B has nothing for the year yet, and is
 * deleted where B already keeps her own — so no row is left under a shadow id nobody reads any more. Every
 * table of the registry, in its order; the access-log rows of those figures move with them.
 */
export async function moveShadowDataToAccount(tx: TransactionClient, shadowId: string, accountId: string, taxYear: number): Promise<void> {
  await allowErasure(tx)
  const from = { userId: shadowId }
  for (const entry of genericDeletionEntries()) {
    const table = (tx as unknown as Record<string, Table>)[delegateName(entry.model)]!
    if ((await table.count({ where: from })) === 0) continue
    const taken = await table.count({ where: HAS_TAX_YEAR.has(entry.model) ? { userId: accountId, taxYear } : { userId: accountId } })
    if (taken === 0) await table.updateMany({ where: from, data: { userId: accountId } })
    else await table.deleteMany({ where: from })
  }
  await tx.taxDataAccessLog.updateMany({ where: from, data: { userId: accountId } })
}
