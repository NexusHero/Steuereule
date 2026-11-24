// The shared rate-limit storage against a real Redis (ADR-0109). Skipped without REDIS_URL.
import { describe, expect, it } from 'vitest'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'

const url = process.env.REDIS_URL?.trim()
const suite = url ? describe : describe.skip

suite('rate-limit storage on Redis', () => {
  it('counts across two storages (two instances) sharing one Redis', async () => {
    const a = createResettableRateLimitStorage({ redisUrl: url })
    const b = createResettableRateLimitStorage({ redisUrl: url })
    const key = `it:${Math.random().toString(36).slice(2)}`
    const rule = { window: 30, max: 2 }
    expect((await a.consume(key, rule)).allowed).toBe(true)
    expect((await b.consume(key, rule)).allowed).toBe(true)
    const third = await a.consume(key, rule)
    expect(third.allowed).toBe(false)
    expect(third.retryAfter).toBeGreaterThan(0)
    a.close?.()
    b.close?.()
  })

  it('does not use up the budget with a refused amount', async () => {
    const s = createResettableRateLimitStorage({ redisUrl: url })
    const key = `it:${Math.random().toString(36).slice(2)}`
    const rule = { window: 30, max: 100 }
    expect((await s.consume(key, rule, 60)).allowed).toBe(true)
    expect((await s.consume(key, rule, 60)).allowed).toBe(false)
    expect((await s.consume(key, rule, 40)).allowed).toBe(true)
    s.close?.()
  })
})
