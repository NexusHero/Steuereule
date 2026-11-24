import { describe, expect, it } from 'vitest'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import { SharedThrottlerStorage } from '../src/rate-limit/shared-throttler-storage.js'
import { redisTlsOptions } from '../src/redis/redis-options.js'

describe('SharedThrottlerStorage (ADR-0109)', () => {
  it('blocks the limit+1th hit on the shared storage, even through a second adapter (= a second instance)', async () => {
    const shared = createResettableRateLimitStorage({ redisUrl: '' })
    const instanceA = new SharedThrottlerStorage(shared)
    const instanceB = new SharedThrottlerStorage(shared)
    expect((await instanceA.increment('k', 60_000, 2, 0, 'default')).isBlocked).toBe(false)
    expect((await instanceB.increment('k', 60_000, 2, 0, 'default')).isBlocked).toBe(false)
    const third = await instanceA.increment('k', 60_000, 2, 0, 'default')
    expect(third.isBlocked).toBe(true)
    expect(third.timeToBlockExpire).toBeGreaterThan(0)
    expect(third.totalHits).toBeGreaterThan(2)
  })

  it('keeps keys and throttler names apart', async () => {
    const storage = new SharedThrottlerStorage(createResettableRateLimitStorage({ redisUrl: '' }))
    await storage.increment('k', 60_000, 1, 0, 'default')
    expect((await storage.increment('other', 60_000, 1, 0, 'default')).isBlocked).toBe(false)
    expect((await storage.increment('k', 60_000, 1, 0, 'second')).isBlocked).toBe(false)
  })
})

describe('shared rate-limit storage amounts', () => {
  it('refuses a call that would pass the budget without using the budget up', async () => {
    const storage = createResettableRateLimitStorage({ redisUrl: '' })
    const rule = { window: 60, max: 100 }
    expect((await storage.consume('b', rule, 60)).allowed).toBe(true)
    expect((await storage.consume('b', rule, 60)).allowed).toBe(false)
    expect((await storage.consume('b', rule, 40)).allowed).toBe(true)
    expect((await storage.consume('b', rule, 1)).allowed).toBe(false)
  })

  it('refuses a single call larger than the whole budget', async () => {
    const storage = createResettableRateLimitStorage({ redisUrl: '' })
    expect((await storage.consume('b', { window: 60, max: 10 }, 11)).allowed).toBe(false)
  })

  it('falls back to memory when Redis is unreachable', async () => {
    const storage = createResettableRateLimitStorage({ redisUrl: 'redis://127.0.0.1:1' })
    expect((await storage.consume('x', { window: 60, max: 1 })).allowed).toBe(true)
    expect((await storage.consume('x', { window: 60, max: 1 })).allowed).toBe(false)
    storage.close?.()
  })
})

describe('redisTlsOptions', () => {
  it('passes a private CA, with flattened newlines restored', () => {
    expect(redisTlsOptions({ REDIS_TLS_CA: '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----' })).toEqual({
      tls: { ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----' },
    })
  })
  it('adds nothing without one', () => {
    expect(redisTlsOptions({})).toEqual({})
  })
})
