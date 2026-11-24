import { describe, expect, it, vi } from 'vitest'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'

// ADR-0107 H5 (pentest 2026-11-23): a Redis error used to be swallowed silently, dropping every
// better-auth limit, the per-account sign-in limit (D9) and the guest-write limit (D8) to a weaker
// per-process in-memory fallback with no operator signal. The fallback must stay (a Redis blip must
// not lock everyone out), but it must never be silent.
describe('rate-limit storage — Redis fallback is signalled, not silent (ADR-0107 H5)', () => {
  const rule = { window: 10, max: 3 }

  it('calls onDegraded when the configured Redis is unreachable, and still answers from memory', async () => {
    const onDegraded = vi.fn()
    // Port 1 refuses immediately — a dead Redis.
    const storage = createResettableRateLimitStorage({ redisUrl: 'redis://127.0.0.1:1', onDegraded })

    const result = await storage.consume('sign-in-account:victim@example.com', rule)

    expect(result.allowed).toBe(true) // graceful degradation — not fail-closed
    expect(onDegraded).toHaveBeenCalledTimes(1)
    expect(onDegraded.mock.calls[0]![0]).toBeInstanceOf(Error)
  })

  it('the in-memory fallback still enforces the limit (degraded, but not open)', async () => {
    const onDegraded = vi.fn()
    const storage = createResettableRateLimitStorage({ redisUrl: 'redis://127.0.0.1:1', onDegraded })

    const key = 'sign-in-account:bruteforce@example.com'
    const outcomes = []
    for (let i = 0; i < rule.max + 1; i += 1) outcomes.push((await storage.consume(key, rule)).allowed)

    expect(outcomes.slice(0, rule.max)).toEqual([true, true, true])
    expect(outcomes[rule.max]).toBe(false) // the (max+1)th attempt is still blocked
    expect(onDegraded).toHaveBeenCalled()
  })

  it('without a Redis URL it uses memory directly and never signals degradation', async () => {
    const onDegraded = vi.fn()
    const storage = createResettableRateLimitStorage({ onDegraded })

    await storage.consume('x', rule)

    expect(onDegraded).not.toHaveBeenCalled()
  })
})
