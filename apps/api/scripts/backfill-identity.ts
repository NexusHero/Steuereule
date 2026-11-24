// Converts identity rows to ciphertext + e-mail hash (ADR-0109). Idempotent; safe to re-run.
//   tsx scripts/backfill-identity.ts --phase=hash     before the release: fills emailHash, plaintext stays
//   tsx scripts/backfill-identity.ts                  after the release: encrypts what is left
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { backfillIdentity, type BackfillPhase } from '../src/auth/identity-backfill.prisma.js'
import { publishEmailHashSalt, resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'

const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='))?.slice('--phase='.length) ?? 'encrypt'
if (phaseArg !== 'hash' && phaseArg !== 'encrypt') throw new Error(`--phase must be "hash" or "encrypt", got "${phaseArg}"`)

const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
publishEmailHashSalt()
const plain = new PrismaClient()
const encrypted = plain.$extends(fieldEncryptionExtension({ encryptionKey, decryptionKeys })) as unknown as PrismaClient
try {
  const result = await backfillIdentity(plain, encrypted, phaseArg as BackfillPhase)
  console.log(JSON.stringify({ phase: phaseArg, ...result }))
  // A skipped row is not an error, but the operator has to run it again.
  if (result.skipped > 0) process.exitCode = 2
} finally {
  await plain.$disconnect()
}
