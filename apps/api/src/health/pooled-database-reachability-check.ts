import { runAnonymouslyInDatabase } from '../common/database-identity.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { DatabaseReachabilityCheck } from './health.service.js'

const DEFAULT_TTL_MS = 1_500

const DEFAULT_TIMEOUT_MS = 2_000

/** Per-request readiness probe against the pooled database connection. */
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

export type PooledReachabilityCheckDependency = Pick<PrismaService, '$queryRaw'>

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

    // Outside any request: no user, and no reason to pass a policy either. It runs anonymously, on purpose (a query
    // with no identity at all is refused), and reads no table.
    const result = withTimeout(runAnonymouslyInDatabase('readiness-probe', () => prisma.$queryRaw`SELECT 1`), timeoutMs).then(() => undefined)
    cached = { expiresAt: now + ttlMs, result }
    return result
  }
}
