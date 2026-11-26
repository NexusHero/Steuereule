import { describe, expect, it } from 'vitest'
import { currentDatabaseIdentity, MissingDatabaseIdentityError } from '../src/common/database-identity.js'
import { createPooledDatabaseReachabilityCheck } from '../src/health/pooled-database-reachability-check.js'

describe('readiness probe and the database identity', () => {
  it('runs its query anonymously (readiness-probe): an identity, so the clients do not refuse it, yet no policy is passed', async () => {
    const seen: unknown[] = []
    // A stand-in for the transaction-aware client: a query without identity is refused, as in production.
    const prisma = {
      $queryRaw: (() => {
        const identity = currentDatabaseIdentity()
        seen.push(identity)
        return identity === undefined ? Promise.reject(new MissingDatabaseIdentityError('$queryRaw')) : Promise.resolve([{ '?column?': 1 }])
      }) as never,
    }
    const check = createPooledDatabaseReachabilityCheck(prisma)

    await expect(check()).resolves.toBeUndefined()
    expect(seen).toEqual([{ kind: 'anonymous', reason: 'readiness-probe' }])
  })
})
