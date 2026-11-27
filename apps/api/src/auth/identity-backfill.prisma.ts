import { SCHEMA_MODEL } from '../prisma/schema-model.js'
import { Prisma, type PrismaClient } from '@prisma/client'
import { analyseDMMF } from 'prisma-field-encryption/dist/dmmf.js'
import { hashString } from 'prisma-field-encryption/dist/hash.js'

/**
 * Converts the identity rows written before ADR-0109 (plaintext e-mail, name, session address and agent)
 * to ciphertext plus the e-mail hash. Idempotent: a converted row is skipped, so a second run changes
 * nothing and a half-converted table is simply finished.
 *
 * The extension passes a value that is not ciphertext through unchanged on read, whatever the field mode,
 * so the app serves plaintext and converted rows side by side while this runs.
 */
export type BackfillPhase = 'hash' | 'encrypt'

export interface IdentityBackfillResult {
  usersConverted: number
  sessionsConverted: number
  /** Rows left for the next run: changed under us, or an address that collides with another one. */
  skipped: number
}

const CIPHERTEXT = 'v1.aesgcm256.%'
const BATCH = 200

function emailHashOf(email: string): string {
  const hash = analyseDMMF(SCHEMA_MODEL).User?.fields.email?.hash
  if (!hash) throw new Error('User.email carries no hash annotation in the schema.')
  return hashString(email, hash)
}

export async function backfillIdentity(
  plain: PrismaClient,
  encrypted: PrismaClient,
  phase: BackfillPhase = 'encrypt',
): Promise<IdentityBackfillResult> {
  const result: IdentityBackfillResult = { usersConverted: 0, sessionsConverted: 0, skipped: 0 }

  let cursor = ''
  for (;;) {
    // `hash` only fills the new column and leaves the plaintext, so instances of the previous release keep working.
    const ids = await plain.$queryRaw<{ id: string }[]>(
      phase === 'hash'
        ? Prisma.sql`SELECT "id" FROM "User" WHERE "emailHash" IS NULL AND "id" > ${cursor} ORDER BY "id" LIMIT ${BATCH}`
        : Prisma.sql`SELECT "id" FROM "User" WHERE ("emailHash" IS NULL OR "email" NOT LIKE ${CIPHERTEXT} OR "name" NOT LIKE ${CIPHERTEXT})
            AND "id" > ${cursor} ORDER BY "id" LIMIT ${BATCH}`,
    )
    if (ids.length === 0) break
    for (const { id } of ids) {
      cursor = id
      // Read through the extension: plaintext stays plaintext, ciphertext is decrypted.
      const user = await encrypted.user.findUnique({ where: { id } })
      if (!user) continue
      if (phase === 'hash') {
        try {
          await plain.$executeRaw`UPDATE "User" SET "emailHash" = ${emailHashOf(user.email)} WHERE "id" = ${id} AND "emailHash" IS NULL`
          result.usersConverted++
        } catch (error) {
          if (!isUniqueViolation(error)) throw error
          result.skipped++
        }
        continue
      }
      try {
        // The extension encrypts and writes the hash; `updatedAt` as the guard keeps a concurrent change from being overwritten.
        const { count } = await encrypted.user.updateMany({
          where: { id, updatedAt: user.updatedAt },
          data: { email: user.email, name: user.name, updatedAt: user.updatedAt },
        })
        if (count === 1) result.usersConverted++
        else result.skipped++
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        result.skipped++
      }
    }
  }

  if (phase === 'hash') return result

  cursor = ''
  for (;;) {
    const ids = await plain.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Session"
      WHERE ("ipAddress" IS NOT NULL AND "ipAddress" NOT LIKE ${CIPHERTEXT} OR "userAgent" IS NOT NULL AND "userAgent" NOT LIKE ${CIPHERTEXT})
        AND "id" > ${cursor} ORDER BY "id" LIMIT ${BATCH}`)
    if (ids.length === 0) break
    for (const { id } of ids) {
      cursor = id
      const session = await encrypted.session.findUnique({ where: { id } })
      if (!session) continue
      const { count } = await encrypted.session.updateMany({
        where: { id, updatedAt: session.updatedAt },
        data: { ipAddress: session.ipAddress, userAgent: session.userAgent, updatedAt: session.updatedAt },
      })
      if (count === 1) result.sessionsConverted++
      else result.skipped++
    }
  }
  return result
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
