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

const DEV_ONLY_FALLBACK_HASH_SALT = 'dev-only-email-hash-salt'

/**
 * Salt of the e-mail lookup hash (ADR-0109). Without a secret salt the hash would be a dictionary of
 * known addresses. It cannot rotate without re-hashing every row, so it is a separate setting from the
 * rotatable encryption key. Published to the env var the extension reads when it parses the schema.
 */
export function resolveEmailHashSalt(env: NodeJS.ProcessEnv = process.env): string {
  const salt = env.PRISMA_FIELD_ENCRYPTION_HASH_SALT
  if (salt && salt.length > 0) return salt
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'PRISMA_FIELD_ENCRYPTION_HASH_SALT must be set in production — an unsalted e-mail hash can be reversed ' +
        'with a list of addresses (ADR-0109).',
    )
  }
  return DEV_ONLY_FALLBACK_HASH_SALT
}

/** The extension reads the salt from the process env when it is created, so it has to be there first. */
export function publishEmailHashSalt(env: NodeJS.ProcessEnv = process.env): void {
  env.PRISMA_FIELD_ENCRYPTION_HASH_SALT = resolveEmailHashSalt(env)
}
