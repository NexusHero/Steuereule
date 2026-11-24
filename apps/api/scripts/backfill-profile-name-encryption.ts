// One-time, idempotent rollout backfill for ADR-0107 H3: Profile.firstName/lastName became
// field-encrypted in non-strict mode, which only encrypts on the next write — rows written before
// the deployment and never updated since would keep their name in cleartext at rest. This re-saves
// every such row through the encrypted Prisma client so the ciphertext lands, and skips rows already
// encrypted (so it is safe to run on every `migrate:deploy`). Runs in the one rollout entry
// (scripts/migrate-deploy.mjs), so no pipeline can forget it.
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'

const CIPHERTEXT_ENVELOPE = /^v\d+\.aesgcm256\./

interface RawProfileNameRow {
  id: string
  firstName: string
  lastName: string
}

export async function backfillProfileNameEncryption(
  prisma: PrismaClient = new PrismaClient(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ scanned: number; reEncrypted: number }> {
  const encrypted = prisma.$extends(fieldEncryptionExtension(resolveFieldEncryptionKey(env)))
  try {
    // Raw read bypasses the extension, so we see what is actually stored (cleartext vs envelope).
    const rows = await prisma.$queryRawUnsafe<RawProfileNameRow[]>(
      'SELECT "id", "firstName", "lastName" FROM "Profile"',
    )
    let reEncrypted = 0
    for (const row of rows) {
      if (CIPHERTEXT_ENVELOPE.test(row.firstName) && CIPHERTEXT_ENVELOPE.test(row.lastName)) continue
      // Read through the encrypted client (non-strict: decrypts an envelope, passes cleartext through)
      // so a half-migrated row comes back fully in cleartext, then write it back to encrypt both.
      const decrypted = await encrypted.profile.findUnique({
        where: { id: row.id },
        select: { firstName: true, lastName: true },
      })
      if (!decrypted) continue
      await encrypted.profile.update({
        where: { id: row.id },
        data: { firstName: decrypted.firstName, lastName: decrypted.lastName },
      })
      reEncrypted += 1
    }
    return { scanned: rows.length, reEncrypted }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfillProfileNameEncryption()
    .then(({ scanned, reEncrypted }) => {
      console.log(`[backfill] profile name encryption: ${reEncrypted}/${scanned} row(s) re-encrypted at rest`)
    })
    .catch((error: unknown) => {
      console.error('[backfill] profile name encryption failed:', error)
      process.exitCode = 1
    })
}
