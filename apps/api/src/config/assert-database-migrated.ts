import { readdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url.js'
import { disconnectQuietly, redactCause, withTimeout } from './assert-database-reachable.js'

const PROBE_TIMEOUT_MS = 5_000

const MIGRATIONS_DIR = new URL('../../prisma/migrations/', import.meta.url)

export function listExpectedMigrations(dir: URL | string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export function findMissingMigrations(expected: readonly string[], applied: readonly string[]): string[] {
  const appliedSet = new Set(applied)
  return expected.filter((name) => !appliedSet.has(name))
}

/** The third boot finding: presence → reachability → usability. */
export interface MigrationRecordClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  $disconnect(): Promise<void>
}

export interface AssertDatabaseMigratedOptions {
  env?: NodeJS.ProcessEnv
  expected?: readonly string[]
  createClient?: (databaseUrl: string) => MigrationRecordClient
}

const REFUSAL_ADVICE =
  'Run `prisma migrate deploy` (on k3s: let the migration Job finish) before starting this ' +
  'process; it refuses rather than listening and failing every request on first access.'

export async function assertDatabaseMigrated(options: AssertDatabaseMigratedOptions = {}): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(options.env ?? process.env)
  const expected = options.expected ?? listExpectedMigrations()
  const createClient =
    options.createClient ??
    ((url: string): MigrationRecordClient => new PrismaClient({ datasources: { db: { url } } }))

  const client = createClient(databaseUrl)
  let applied: string[]
  try {
    const rows = await withTimeout(
      client.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      PROBE_TIMEOUT_MS,
    )
    applied = rows.map((row) => row.migration_name)
  } catch (rawCause) {
    // oxlint-disable-next-line eslint/preserve-caught-error
    throw new Error(
      `Cannot read the applied-migration record (_prisma_migrations) — refusing to start. ${REFUSAL_ADVICE}`,
      { cause: redactCause(rawCause) },
    )
  } finally {
    await disconnectQuietly(client)
  }

  const missing = findMissingMigrations(expected, applied)
  if (missing.length > 0) {
    throw new Error(
      `The database is reachable but not migrated: ${missing.length} migration(s) this build expects ` +
        `are not applied (${missing.join(', ')}) — refusing to start. ${REFUSAL_ADVICE}`,
    )
  }
}
