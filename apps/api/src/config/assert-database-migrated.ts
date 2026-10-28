// The third boot finding (#289): presence → reachability → usability. `SELECT 1`
// answers on an empty Postgres, so a reachable database with no schema used to pass
// the reachability probe and the server listened, then 500'd on every real request.
// On k3s the migration Job and the Deployment have no inherent ordering, so a pod
// starting before the Job finished is the normal case, not an exotic one — refusing
// here is the signal the platform needs (the pod restarts until the Job is through).
//
// The check holds the migration directories this build ships (`prisma/migrations/`)
// against `_prisma_migrations` rows that finished and were not rolled back. Both are
// generated from the same `prisma/migrations/` + `schema.prisma`, so this reads the
// condition itself, not a shadow of it (a "does table X exist" probe would be #284's
// proxy shape). `_prisma_migrations` is a Prisma internal: every failure of the query
// — missing table, renamed column, timeout — is a refusal, never a pass-through.
//
// Deliberately not a migration runner: running migrations stays the platform's job.
import { readdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url.js'
import { disconnectQuietly, redactCause, withTimeout } from './assert-database-reachable.js'

const PROBE_TIMEOUT_MS = 5_000

// Resolves from both `src/config/` and the compiled `dist/config/` to the same
// `apps/api/prisma/migrations` — the Dockerfile copies the whole repo, so it ships.
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
    // Same redaction rule as the reachability probe: the raw error can carry the
    // configured username, so only its class name travels as `cause`.
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
