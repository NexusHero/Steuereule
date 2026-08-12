// #338 F1 (Musti's §4, measured) — the per-request readiness probe, deliberately a
// SECOND implementation behind the `DATABASE_REACHABILITY_CHECK` token, not a reuse of
// #275's `assertDatabaseReachable`. That function is the right shape for the one-shot
// boot-time call it was written for (throwaway client, connect, `SELECT 1`, disconnect)
// — wiring it as a per-request probe gave an unauthenticated, unrated endpoint a 1:1
// mapping onto new Postgres backends. Measured directly on real Postgres
// (`max_connections=100`): 50 concurrent probes fulfilled clean, 80 and 120 concurrent
// probes ALL timed out — against a database a held-open psql session confirmed was
// completely healthy throughout. The failure is not "the endpoint gets slow": every
// replica answers `503 not ready` at once, k3s pulls every pod from the Service, and
// liveness (which never touches the database) keeps answering `200`, so nothing
// restarts and nothing self-heals. A full self-inflicted outage from a single laptop,
// no session required.
//
// This closes all three of Musti's named defects with one change:
//
//   1. Cost per request — no throwaway client. `prisma.$queryRaw` runs on the app's own
//      already-established connection pool (`PrismaService`, bound once at boot), the
//      exact pool every real request is served from.
//   2. It now probes the RIGHT thing — "is the pool this pod actually serves requests
//      with usable", not "does a brand-new connection to whatever `DATABASE_URL` says
//      right now succeed" (which `assertDatabaseReachable`, re-reading `process.env` on
//      every call, could answer `ok` for even with an exhausted or broken pool).
//   3. Coalescing — concurrent callers within `ttlMs` of the most recent probe share its
//      IN-FLIGHT (or just-settled) result instead of each starting a new round trip. N
//      simultaneous requests now cost exactly one `SELECT 1`, capping this endpoint's
//      database cost at "the existing pool can always answer one query" regardless of
//      how many requests arrive — the fix for the measured 80/120-concurrent collapse.
//
// Does NOT reopen `assert-database-reachable.ts`'s own "stay out of PrismaService's way"
// rule (Musti pre-empted this): that rule is about BUILDING the app never needing a live
// database (`buildApp()`/`test/support/build-test-app.ts`/`generate-openapi-spec.ts`).
// Injecting `PrismaService` here and only ever touching it inside a request handler
// (never in a constructor, never at module-init) honours it exactly — `buildTestApp`
// already stubs `PrismaService` with `{}` and this module never calls anything on it
// until a real `/v1/health/ready` request arrives.
import type { PrismaService } from '../prisma/prisma.service.js'
import type { DatabaseReachabilityCheck } from './health.service.js'

/** 1-2s, per Musti's review — long enough that a realistic burst of concurrent
 *  requests (the measured failure mode) coalesces onto one round trip, short enough
 *  that a genuine outage is still visible within roughly one k8s probe period. */
const DEFAULT_TTL_MS = 1_500

/** The pooled probe answers in low milliseconds when the pool is healthy — this is a
 *  request-serving budget, not `assertDatabaseReachable`'s 5s boot-time budget (a
 *  readiness probe that itself hangs for 5s is its own availability problem). */
const DEFAULT_TIMEOUT_MS = 2_000

export class ReadinessProbeTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ReadinessProbeTimeoutError(`readiness probe against the app's own connection pool timed out after ${ms}ms`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('unknown error'))
      },
    )
  })
}

/** The one method this module actually calls — narrowed so a test can hand in a plain
 *  counting fake instead of a real `PrismaService`/`PrismaClient` (mirrors the
 *  `Pick<PrismaClient, '$disconnect'>` idiom `disconnectQuietly` already uses in
 *  `assert-database-reachable.ts`). */
export type PooledReachabilityCheckDependency = Pick<PrismaService, '$queryRaw'>

/**
 * Builds the `DATABASE_REACHABILITY_CHECK` implementation `HealthModule` wires for the
 * real, request-serving process. Coalesces concurrent calls: a call within `ttlMs` of
 * the most recently STARTED probe returns that same in-flight (or just-settled) promise
 * rather than starting a new one — so the number of actual `SELECT 1` round trips this
 * function performs is bounded by wall-clock time, never by request volume. A failed
 * probe is cached for the identical `ttlMs` as a successful one (no separate eviction
 * path): the next call after the window simply tries again, exactly as it would after a
 * success — a transient failure does not get to linger any longer than a transient
 * success would.
 */
export function createPooledDatabaseReachabilityCheck(
  prisma: PooledReachabilityCheckDependency,
  options: { ttlMs?: number; timeoutMs?: number } = {},
): DatabaseReachabilityCheck {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let cached: { expiresAt: number; result: Promise<void> } | undefined

  return function pooledDatabaseReachabilityCheck(): Promise<void> {
    const now = Date.now()
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.result
    }

    const result = withTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs).then(() => undefined)
    cached = { expiresAt: now + ttlMs, result }
    return result
  }
}
