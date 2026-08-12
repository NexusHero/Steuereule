// #338 F1 (Musti's §4) — "prove the coalescing does what you claim by counting actual
// round trips, not by reading the code." Pure, no-DB, no-Nest test (ADR-0004): a plain
// counting fake standing in for `PrismaService.$queryRaw`, narrowed exactly to the one
// method `createPooledDatabaseReachabilityCheck` calls
// (`PooledReachabilityCheckDependency`). Every assertion below is a call count on that
// fake, not a read of the implementation.
import { describe, expect, it, vi } from 'vitest'
import {
  createPooledDatabaseReachabilityCheck,
  ReadinessProbeTimeoutError,
  type PooledReachabilityCheckDependency,
} from '../src/health/pooled-database-reachability-check.js'

/** A `$queryRaw` fake that counts every real invocation and runs `behavior` for each one
 *  — the thing under test can never see the difference between this and a real
 *  `PrismaService.$queryRaw` tagged-template call. */
function makeCountingQueryRaw(behavior: () => Promise<unknown>): {
  dependency: PooledReachabilityCheckDependency
  callCount: () => number
} {
  let calls = 0
  const queryRaw = vi.fn(async () => {
    calls += 1
    return behavior()
  })
  return {
    dependency: { $queryRaw: queryRaw as unknown as PooledReachabilityCheckDependency['$queryRaw'] },
    callCount: () => calls,
  }
}

describe('createPooledDatabaseReachabilityCheck — #338 F1', () => {
  it('coalesces 50 concurrent callers into exactly ONE round trip — the measured 80/120-concurrent collapse this fix closes', async () => {
    const { dependency, callCount } = makeCountingQueryRaw(async () => [{ '?column?': 1 }])
    const check = createPooledDatabaseReachabilityCheck(dependency, { ttlMs: 5_000, timeoutMs: 1_000 })

    await Promise.all(Array.from({ length: 50 }, () => check()))

    expect(callCount()).toBe(1)
  })

  it('performs a FRESH round trip once the TTL window has elapsed — coalescing never means "answer once, forever"', async () => {
    const { dependency, callCount } = makeCountingQueryRaw(async () => [{ '?column?': 1 }])
    const check = createPooledDatabaseReachabilityCheck(dependency, { ttlMs: 20, timeoutMs: 1_000 })

    await check()
    expect(callCount()).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 60))
    await check()

    expect(callCount()).toBe(2)
  })

  it('a FAILED probe is coalesced too — concurrent callers during an outage share the one rejection, not one failed round trip each', async () => {
    const { dependency, callCount } = makeCountingQueryRaw(async () => {
      throw new Error('connection refused')
    })
    const check = createPooledDatabaseReachabilityCheck(dependency, { ttlMs: 5_000, timeoutMs: 1_000 })

    const results = await Promise.allSettled(Array.from({ length: 20 }, () => check()))

    expect(callCount()).toBe(1)
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
  })

  it('a failure does not linger past its own TTL — the next call after the window tries again, exactly as a success would', async () => {
    let shouldFail = true
    const { dependency, callCount } = makeCountingQueryRaw(async () => {
      if (shouldFail) throw new Error('connection refused')
      return [{ '?column?': 1 }]
    })
    const check = createPooledDatabaseReachabilityCheck(dependency, { ttlMs: 20, timeoutMs: 1_000 })

    await expect(check()).rejects.toThrow('connection refused')
    expect(callCount()).toBe(1)

    shouldFail = false
    await new Promise((resolve) => setTimeout(resolve, 60))
    await expect(check()).resolves.toBeUndefined()

    expect(callCount()).toBe(2)
  })

  it('a probe that never settles is treated as unreachable once it exceeds timeoutMs — a readiness probe must not itself hang', async () => {
    const { dependency } = makeCountingQueryRaw(() => new Promise(() => {}))
    const check = createPooledDatabaseReachabilityCheck(dependency, { ttlMs: 5_000, timeoutMs: 20 })

    await expect(check()).rejects.toBeInstanceOf(ReadinessProbeTimeoutError)
  })
})
