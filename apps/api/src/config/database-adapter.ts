import { availableParallelism } from 'node:os'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma 7 has no query engine: every client talks to Postgres through a driver adapter and the `pg` pool behind it
 * (upgrade guide, "Driver adapters and client instantiation"). Prisma 6 read pool settings from the connection URL; this
 * module keeps that contract, so `DATABASE_URL` / `KEYSTORE_DATABASE_URL`, `withAdaptiveDatabasePoolUrl` and the
 * `connection_limit=` of the infrastructure secrets (scripts/infra/gcp-setup.sh) mean what they meant before.
 *
 * Translation (Prisma 7 docs, "Connection pool", table "Prisma ORM v7 driver adapter defaults"):
 *   connection_limit              -> pool `max`                     (default: CPUs * 2 + 1, as in Prisma 6)
 *   pool_timeout, connect_timeout -> `connectionTimeoutMillis`      (pg has one timeout for both; the longer wins, default 10s)
 *   max_idle_connection_lifetime  -> `idleTimeoutMillis`            (default 300s, as in Prisma 6; pg's own default is 10s)
 *   max_connection_lifetime       -> `maxLifetimeSeconds`           (default none)
 *   schema                        -> the adapter's `schema` option
 * Every other parameter (`options=-c role=…`, `host=` of a Cloud SQL socket, `sslmode`) is left in the connection string
 * for `pg` to read. The Prisma-only parameters are removed from it.
 */
const PRISMA_ONLY_PARAMETERS = new Set([
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'max_idle_connection_lifetime',
  'max_connection_lifetime',
  'schema',
  'socket_timeout',
  'statement_cache_size',
  'pgbouncer',
])

export interface DatabasePoolSettings {
  readonly connectionString: string
  readonly max: number
  readonly connectionTimeoutMillis: number
  readonly idleTimeoutMillis: number
  readonly maxLifetimeSeconds?: number
  readonly schema?: string
}

const DEFAULT_ACQUIRE_TIMEOUT_SECONDS = 10
const DEFAULT_IDLE_SECONDS = 300

function positiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** Splits the Prisma-only parameters from the URL without re-serialising it (a Cloud SQL socket path and the password stay byte for byte). */
export function parseDatabaseUrl(databaseUrl: string, cpus: number = availableParallelism()): DatabasePoolSettings {
  const trimmed = databaseUrl.trim()
  const queryStart = trimmed.indexOf('?')
  if (queryStart === -1) {
    return {
      connectionString: trimmed,
      max: Math.max(1, cpus) * 2 + 1,
      connectionTimeoutMillis: DEFAULT_ACQUIRE_TIMEOUT_SECONDS * 1000,
      idleTimeoutMillis: DEFAULT_IDLE_SECONDS * 1000,
    }
  }
  const base = trimmed.slice(0, queryStart)
  const pairs = trimmed.slice(queryStart + 1).split('&').filter((pair) => pair !== '')
  const prismaOnly = new Map<string, string>()
  const kept: string[] = []
  for (const pair of pairs) {
    const equals = pair.indexOf('=')
    const key = decodeURIComponent(equals === -1 ? pair : pair.slice(0, equals))
    if (PRISMA_ONLY_PARAMETERS.has(key)) prismaOnly.set(key, equals === -1 ? '' : decodeURIComponent(pair.slice(equals + 1)))
    else kept.push(pair)
  }
  const acquire = positiveNumber(prismaOnly.get('pool_timeout')) ?? DEFAULT_ACQUIRE_TIMEOUT_SECONDS
  const connect = positiveNumber(prismaOnly.get('connect_timeout')) ?? 0
  const maxLifetime = positiveNumber(prismaOnly.get('max_connection_lifetime'))
  const schema = prismaOnly.get('schema')
  return {
    connectionString: kept.length === 0 ? base : `${base}?${kept.join('&')}`,
    max: Math.floor(positiveNumber(prismaOnly.get('connection_limit')) ?? Math.max(1, cpus) * 2 + 1),
    connectionTimeoutMillis: Math.max(acquire, connect) * 1000,
    idleTimeoutMillis: (positiveNumber(prismaOnly.get('max_idle_connection_lifetime')) ?? DEFAULT_IDLE_SECONDS) * 1000,
    ...(maxLifetime === undefined ? {} : { maxLifetimeSeconds: maxLifetime }),
    ...(schema === undefined || schema === '' ? {} : { schema }),
  }
}

/** The driver adapter every `PrismaClient` of this API is built with: `new PrismaClient({ adapter: createDatabaseAdapter(url) })`. */
export function createDatabaseAdapter(databaseUrl: string | undefined = process.env.DATABASE_URL): PrismaPg {
  // Prisma 6 failed on the first query without a URL; Prisma 7 cannot even build the client, so say it here.
  if (databaseUrl === undefined || databaseUrl.trim() === '') throw new Error('DATABASE_URL must be set.')
  const { schema, ...pool } = parseDatabaseUrl(databaseUrl)
  return new PrismaPg(pool, schema === undefined ? undefined : { schema })
}
