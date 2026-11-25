import type { PrismaClient } from '@prisma/client'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * The transaction-local setting the append-only trigger of migration 20261120100000_self_employment
 * checks: only with it on may a journal entry, its lines, the log or the book be deleted. Art. 17
 * DSGVO wins over the GoBD retention for the app's copy; it is set only inside an erasure.
 */
export const ERASURE_SETTING = 'steuereule.erasure'

/** Turns the erasure flag on for the rest of this transaction only (`set_config(…, true)`). */
export async function allowErasure(tx: Pick<TransactionClient, '$executeRaw'>): Promise<void> {
  await tx.$executeRaw`SELECT set_config(${ERASURE_SETTING}, 'on', true)`
}
