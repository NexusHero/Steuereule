import type { PrismaClient } from '@prisma/client'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Lets this transaction delete the book rows (journal entries, their lines, the log, the book) of `ownerIds`.
 * The append-only triggers let a DELETE through only with a grant that the database function
 * `app_rls.allow_erasure` writes (migration …_erasure_grant_and_coupling_guard): it is owned by the migration
 * login, refuses while the tax data of an owner are under a legal hold (GoBD, § 147 AO), and binds the grant to
 * this transaction and these owners. No setting a login could make itself opens the book any more. Art. 17
 * DSGVO wins over the retention for the app's copy only where no hold says otherwise.
 */
export async function allowErasure(tx: Pick<TransactionClient, '$executeRaw'>, ownerIds: readonly string[]): Promise<void> {
  await tx.$executeRaw`SELECT app_rls.allow_erasure(${[...ownerIds]}::text[])`
}
