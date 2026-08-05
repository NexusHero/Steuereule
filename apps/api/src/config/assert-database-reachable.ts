// The boot-time database-reachability guard. Lives here, next to `resolveDatabaseUrl`,
// deliberately NOT inside `PrismaService`/anywhere Prisma-adjacent (Musti's ruling): the
// contract `prisma.service.ts` protects — "building the app never needs a live
// database" — is shared by `buildApp()` (tests, `test/support/build-test-app.ts`,
// `scripts/generate-openapi-spec.ts`) and the real process alike, and only the latter
// may assume a database. `main.ts`'s `bootstrap()` is that one caller — it's the only
// place this module is imported from, and it runs only for the real, request-serving
// process (guarded by `VITEST !== 'true'` in main.ts).
//
// Two separate findings, two separate messages, never collapsed into one (same rule as
// #272/#273's version-drift argument): `resolveDatabaseUrl()` below answers "is
// DATABASE_URL configured at all" with no I/O; this function answers "can the
// configured database actually be reached" with a real, timeboxed query. A stakeholder
// hit exactly the second failure (wrong host/port in their own compose setup) while the
// server booted and answered every non-DB route just fine — a presence check alone
// would have said nothing.
//
// Fails fast, does not retry: a retry loop here would turn "the database is down" into
// "the process starts slowly", hiding the exact failure this guard exists to surface.
// Retry-until-ready across a startup dependency is the orchestrator's job (e.g. Compose
// `depends_on: { postgres: { condition: service_healthy } }`), not this process's.
import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url.js'

const PROBE_TIMEOUT_MS = 5_000

/**
 * Describes where a reachability probe was attempted, WITHOUT ever exposing the
 * connection string itself — `DATABASE_URL` carries the database password, and a
 * fail-fast guard that writes credentials into container/process logs would be a worse
 * defect than the one it exists to catch (Musti's review, explicit and non-negotiable).
 * Falls back to a redacted, still-credential-free description if the value isn't even a
 * parseable URL, rather than ever interpolating the raw string.
 */
export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    const port = url.port || '5432'
    return `${url.hostname}:${port}`
  } catch {
    return 'the configured database (DATABASE_URL is not a parseable connection URL)'
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolves `DATABASE_URL` (throwing the presence finding if unset) and then attempts a
 * real, timeboxed query against it. Throws the reachability finding — host:port only,
 * never the DSN — if that query doesn't succeed in time. Used exactly once, at the very
 * start of `main.ts`'s `bootstrap()`, before the Nest app is even built.
 */
export async function assertDatabaseReachable(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(env)
  const target = describeDatabaseTarget(databaseUrl)

  // A standalone client, not the app's own PrismaService/DI graph — this check must be
  // able to run (and fail) before any of that is constructed, and must not leave a
  // pooled connection behind for the app that starts right after it.
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS)
  } catch (cause) {
    throw new Error(
      `Cannot reach the database at ${target} within ${PROBE_TIMEOUT_MS}ms — refusing to start. ` +
        'This process fails fast and does not retry (12-Factor IX); fix connectivity or the ' +
        'startup order at the orchestrator (e.g. a depends_on: service_healthy dependency on the ' +
        'database container), not by waiting on this one.',
      { cause: cause instanceof Error ? cause : new Error(String(cause)) },
    )
  } finally {
    await prisma.$disconnect()
  }
}
