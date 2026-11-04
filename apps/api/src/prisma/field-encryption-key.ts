export interface FieldEncryptionKeys {
  encryptionKey: string
  decryptionKeys: string[]
}

const DEV_ONLY_FALLBACK_KEY = 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='

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
