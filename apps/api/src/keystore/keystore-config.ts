import { hkdfSync } from 'node:crypto'

/**
 * Connection string of the keystore database (ADR-0059). Production must name it explicitly
 * (its own instance with a shorter backup retention); outside production it defaults to a
 * sibling database `<name>_keystore` on the tax-data server, so dev, CI and E2E need no setup.
 */
export function resolveKeystoreDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.KEYSTORE_DATABASE_URL?.trim()
  if (explicit) return explicit
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'KEYSTORE_DATABASE_URL must be set in production — the receipt keys must not share the ' +
        'tax-data database and its backups (ADR-0059).',
    )
  }
  const mainUrl = env.DATABASE_URL?.trim()
  if (!mainUrl) throw new Error('DATABASE_URL is not set, so no keystore database can be derived.')
  const url = new URL(mainUrl)
  url.pathname = `${url.pathname.replace(/\/$/, '') || '/steuereule'}_keystore`
  return url.toString()
}

export interface KeystoreMasterKeys {
  /** Wraps every new DEK. */
  readonly current: Buffer
  /** Still accepted for unwrapping during a rotation. */
  readonly previous: readonly Buffer[]
}

const DEV_ONLY_KEYSTORE_SECRET = 'steuereule-dev-only-keystore-master-key'

function deriveMasterKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('steuereule-keystore-v1'), 'kek-master', 32))
}

/** KEYSTORE_MASTER_KEY (+ comma-separated KEYSTORE_MASTER_KEY_PREVIOUS for rotation). */
export function resolveKeystoreMasterKeys(env: NodeJS.ProcessEnv = process.env): KeystoreMasterKeys {
  const current = env.KEYSTORE_MASTER_KEY?.trim()
  if (!current) {
    if (env.NODE_ENV === 'production') {
      throw new Error('KEYSTORE_MASTER_KEY must be set in production (ADR-0059).')
    }
    return { current: deriveMasterKey(DEV_ONLY_KEYSTORE_SECRET), previous: [] }
  }
  const previous = (env.KEYSTORE_MASTER_KEY_PREVIOUS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map(deriveMasterKey)
  return { current: deriveMasterKey(current), previous }
}
