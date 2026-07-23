// The swap seam for the field-encryption data-encryption key (ADR-0008), mirroring
// resolveGuestSessionSecret() in ../auth/guest-session.ts: reads a sealed-secret env
// var today, swaps to a vault/KMS-backed lookup later — only this function changes,
// the Prisma client extension it feeds never does.
//
// Format is the `@47ng/cloak` keychain prisma-field-encryption expects natively:
// `k<generation>.aesgcm256.<base64 32-byte key>` — one current PRISMA_FIELD_ENCRYPTION_KEY
// plus zero or more comma-separated, still-decryptable PRISMA_FIELD_DECRYPTION_KEYS for
// rotation (generate a new key, move the old one to the decryption list — config, not a
// data migration for the rotation itself; re-encrypting existing rows under the new key
// is a separate migration, see prisma-field-encryption's built-in migration generator).
export interface FieldEncryptionKeys {
  encryptionKey: string
  decryptionKeys: string[]
}

const DEV_ONLY_FALLBACK_KEY = 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='

/**
 * Resolves the field-encryption keychain. Production must set
 * PRISMA_FIELD_ENCRYPTION_KEY explicitly (12-Factor III) — refusing to start under a
 * guessable default is the whole point of the seam. Dev/test get a fixed, clearly-
 * marked fallback so the stack runs without extra setup; it must never be reachable
 * in production.
 */
export function resolveFieldEncryptionKey(env: NodeJS.ProcessEnv = process.env): FieldEncryptionKeys {
  const encryptionKey = env.PRISMA_FIELD_ENCRYPTION_KEY
  if (!encryptionKey || encryptionKey.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'PRISMA_FIELD_ENCRYPTION_KEY must be set in production — refusing to persist tax ' +
          'data fields unencrypted under a guessable default key (ADR-0008).',
      )
    }
    return { encryptionKey: DEV_ONLY_FALLBACK_KEY, decryptionKeys: [] }
  }

  const decryptionKeys = (env.PRISMA_FIELD_DECRYPTION_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)

  return { encryptionKey, decryptionKeys }
}
