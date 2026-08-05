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

/**
 * Identifies `withTimeout`'s own timeout rejection, and only that — a named class
 * rather than a message-prefix check, so `redactCause`'s one allowed passthrough is an
 * identity check, not string matching against a template that could drift. Exported
 * only so redact-cause.test.ts can exercise the real allowlisted case directly,
 * without waiting out a real timeout.
 */
export class ProbeTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeoutError(`timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Redacts whatever the probe's query attempt threw, for use as the guard error's own
 * `cause` — measured, not assumed to be needed: a wrong-password-but-reachable-host
 * failure (`PrismaClientInitializationError`) puts the *username* right in `.message`
 * ("...credentials for `someuser` are not valid"), and `cause` prints by default
 * wherever this thrown error surfaces unhandled — `bootstrap()`'s own top-level
 * `.catch` does exactly that. Reusing that raw error as `cause` would reopen, at the
 * back of this function, exactly the redaction `describeDatabaseTarget` builds at the
 * front of it.
 *
 * Measured against Prisma 6.19.3's real failure classes (wrong password, connection
 * refused, unknown host, wrong database name): `.errorCode` is `undefined` on every
 * one of them — there is no structured field left that survives redaction and still
 * tells them apart. So a redacted cause carries only the error's class name — today
 * uniformly `PrismaClientInitializationError` for all four — nothing more specific.
 * That still distinguishes "the database rejected us" from this file's own timeout,
 * without carrying anything the server put in the message; it does not distinguish
 * *which* database failure occurred, and no comment here should imply it does.
 *
 * Allowlist, not a denylist (Musti's review): the only value ever passed through
 * unredacted is `ProbeTimeoutError` — recognised by identity, not by "isn't Prisma".
 * Everything else, known or not, is redacted by default. A denylist ("redact only
 * what starts with `Prisma`") would pass anything unrecognised straight through with
 * its full message and stack — a wrapper error, a Node-level DNS/TLS failure, a
 * future Prisma rename — leaking by default, silently, with no test to catch it. This
 * fails the opposite way: anything new lands on the safe side until someone
 * deliberately allowlists it.
 */
export function redactCause(rawCause: unknown): Error {
  if (!(rawCause instanceof Error)) return new Error('unknown error')
  if (rawCause instanceof ProbeTimeoutError) return rawCause
  return new Error(rawCause.constructor.name)
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
  } catch (rawCause) {
    // oxlint's preserve-caught-error only recognises the caught binding passed
    // through *verbatim* as `cause` — it can't see that `redactCause(rawCause)` is
    // still genuinely derived from it, not a fresh, disconnected error. Passing
    // `rawCause` itself, unwrapped, would satisfy the rule syntactically while
    // reopening the exact leak `redactCause` exists to close (see its own comment —
    // measured: a wrong-password failure names the configured username in
    // `.message`). The cause is preserved, redacted, not discarded — this is the
    // rule's blind spot, not a suppressed defect.
    // oxlint-disable-next-line eslint/preserve-caught-error
    throw new Error(
      `Cannot reach the database at ${target} within ${PROBE_TIMEOUT_MS}ms — refusing to start. ` +
        'This process fails fast and does not retry (12-Factor IX); fix connectivity or the ' +
        'startup order at the orchestrator (e.g. a depends_on: service_healthy dependency on the ' +
        'database container), not by waiting on this one.',
      { cause: redactCause(rawCause) },
    )
  } finally {
    await prisma.$disconnect()
  }
}
