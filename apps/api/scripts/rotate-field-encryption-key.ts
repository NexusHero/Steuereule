// Rotates PRISMA_FIELD_ENCRYPTION_KEY (ADR-0008, REQ-003): re-encrypts every value the schema marks
// `/// @encrypted` that is still under a retired key, so the retired key can be dropped from
// PRISMA_FIELD_DECRYPTION_KEYS afterwards. The procedure is in infra/README.md ("Rotating the field key").
//
//   pnpm --filter @steuereule/api rotate:field-key            re-encrypt, then report per model
//   pnpm --filter @steuereule/api rotate:field-key --check    report only; exits 1 while anything is left
//
// Reads the keys the app reads (PRISMA_FIELD_ENCRYPTION_KEY, PRISMA_FIELD_DECRYPTION_KEYS). Idempotent and
// resumable: a value already under the current key is skipped. It exits 1 when a value is under a key that is
// not configured (it is left untouched), or when values are still under a retired key after the run.
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'
import { prismaRotationStore, rotateFieldEncryption, rotationKeys, type RotationCount } from '../src/prisma/field-key-rotation.js'
import { createDatabaseAdapter } from '../src/common/database-adapter.js'

export async function rotateFieldEncryptionKey(
  options: { check: boolean },
  prisma: PrismaClient = new PrismaClient({ adapter: createDatabaseAdapter() }),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ counts: RotationCount[]; ok: boolean }> {
  try {
    const keys = rotationKeys(resolveFieldEncryptionKey(env))
    const counts = await rotateFieldEncryption(prismaRotationStore(prisma), keys, { check: options.check })
    const ok = counts.every((count) => count.unknownKey === 0 && count.retired === 0)
    return { counts, ok }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check')
  rotateFieldEncryptionKey({ check })
    .then(({ counts, ok }) => {
      for (const c of counts) {
        console.log(`[rotate] ${c.model}: ${c.rows} row(s), ${c.reEncrypted} re-encrypted, ${c.retired} still under a retired key, ${c.unknownKey} under an unknown key, ${c.clearText} clear text`)
      }
      console.log(ok ? '[rotate] every encrypted value is under the current key' : '[rotate] NOT done: values remain under a retired or unknown key')
      if (!ok) process.exitCode = 1
    })
    .catch((error: unknown) => {
      console.error('[rotate] field key rotation failed:', error)
      process.exitCode = 1
    })
}
