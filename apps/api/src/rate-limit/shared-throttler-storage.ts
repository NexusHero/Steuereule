import type { ThrottlerStorage } from '@nestjs/throttler'
import type { ResettableRateLimitStorage } from '../auth/rate-limit-storage.js'

/**
 * The `@Throttle` counters on the shared rate-limit storage (Redis when `REDIS_URL` is set), so a limit holds
 * across instances instead of once per process (ADR-0109). The decorators keep their meaning: `limit` hits per
 * `ttl` milliseconds. The storage answers allowed or not rather than a hit count, so a refused call reports
 * `limit + 1` hits and an allowed one a single hit; only the `X-RateLimit-Remaining` header is coarser for it.
 */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

export class SharedThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly storage: ResettableRateLimitStorage) {}

  async increment(key: string, ttl: number, limit: number, _blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const windowSeconds = Math.max(1, Math.ceil(ttl / 1000))
    const decision = await this.storage.consume(`nest:${throttlerName}:${key}`, { window: windowSeconds, max: limit })
    if (decision.allowed) return { totalHits: 1, timeToExpire: windowSeconds, isBlocked: false, timeToBlockExpire: 0 }
    const retryAfter = decision.retryAfter ?? windowSeconds
    return {
      totalHits: limit + 1,
      timeToExpire: retryAfter,
      isBlocked: true,
      timeToBlockExpire: retryAfter,
    }
  }
}
