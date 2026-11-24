import type { BetterAuthRateLimitStorage } from 'better-auth'
import { Redis } from 'ioredis'
import { redisTlsOptions } from '../redis/redis-options.js'

export type RateLimitRule = { window: number; max: number }
export type RateLimitDecision = { allowed: boolean; retryAfter: number | null }

export interface ResettableRateLimitStorage extends BetterAuthRateLimitStorage {
  /** `amount` counts bytes or tokens instead of one request; a refused call does not use up any of the budget. */
  consume(key: string, rule: RateLimitRule, amount?: number): Promise<RateLimitDecision>
  clear(): void
  /** Drops the Redis connection; the in-memory fallback keeps working. */
  close?(): void
}

export interface RateLimitStorageOptions {
  redisUrl?: string | undefined
  /**
   * Called every time a Redis error/timeout forces the bounded in-memory fallback (ADR-0107 H5).
   * The fallback is per-process and evictable, so a shared Redis outage silently degrades every
   * better-auth limit, the per-account sign-in limit (D9) and the guest-write limit (D8) at once —
   * operators must see it. Defaults to a throttled console.warn when not provided.
   */
  onDegraded?: (error: unknown) => void
}

const SWEEP_THRESHOLD = 1_000
const MAX_STORE_ENTRIES = 10_000
const REDIS_TIMEOUT_MS = 400
const DEGRADED_WARN_INTERVAL_MS = 60_000

function makeThrottledDegradedWarning(): (error: unknown) => void {
  let lastWarnedAt = 0
  return (error: unknown) => {
    const now = Date.now()
    if (now - lastWarnedAt < DEGRADED_WARN_INTERVAL_MS) return
    lastWarnedAt = now
    const reason = error instanceof Error ? error.message : String(error)
    // Not fail-closed on purpose (a Redis blip must not lock everyone out), but never silent either.
    console.warn(`[rate-limit] Redis unavailable — degraded to per-process in-memory limits: ${reason}`)
  }
}

function retryAfter(lastRequest: number, windowSeconds: number): number {
  return Math.ceil((lastRequest + windowSeconds * 1000 - Date.now()) / 1000)
}

/** Refuses without counting when the call would pass `max`: an over-budget upload must not burn the budget. */
const LUA_RATE_LIMIT_SCRIPT = `
local cur = tonumber(redis.call("GET", KEYS[1]) or "0")
local add = tonumber(ARGV[2])
if cur + add > tonumber(ARGV[3]) then return {cur + add, redis.call("PTTL", KEYS[1])} end
local c = redis.call("INCRBY", KEYS[1], add)
if c == add then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return {c, redis.call("PTTL", KEYS[1])}`

/** One client for the life of the process (a connection per call cost a TCP/TLS handshake on every request). */
function createRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    ...redisTlsOptions(),
    connectTimeout: REDIS_TIMEOUT_MS,
    commandTimeout: REDIS_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  })
  // A refused connection surfaces on each command; the in-memory fallback answers meanwhile.
  client.on('error', () => undefined)
  return client
}

async function consumeViaRedis(redis: Redis, key: string, rule: RateLimitRule, amount: number): Promise<RateLimitDecision> {
  const reply = (await redis.eval(LUA_RATE_LIMIT_SCRIPT, 1, `steuereule:rl:${key}`, String(rule.window * 1000), String(amount), String(rule.max))) as [
    number,
    number,
  ]
  const [count, pttl] = reply
  if (count > rule.max) return { allowed: false, retryAfter: pttl > 0 ? Math.ceil(pttl / 1000) : rule.window }
  return { allowed: true, retryAfter: null }
}

export function createResettableRateLimitStorage(
  options: RateLimitStorageOptions = {},
): ResettableRateLimitStorage {
  const store = new Map<string, { key: string; count: number; lastRequest: number; expiresAt: number }>()
  const configuredRedisUrl = (options.redisUrl ?? process.env.REDIS_URL)?.trim()
  const redis = configuredRedisUrl ? createRedisClient(configuredRedisUrl) : null
  const signalDegraded = options.onDegraded ?? makeThrottledDegradedWarning()

  function sweepExpired(now: number): void {
    if (store.size < SWEEP_THRESHOLD) return
    for (const [k, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(k)
      }
    }
    while (store.size >= MAX_STORE_ENTRIES) {
      const oldestKey = store.keys().next().value
      if (oldestKey === undefined) break
      store.delete(oldestKey)
    }
  }

  function consumeInMemory(key: string, rule: RateLimitRule, amount: number): RateLimitDecision {
    const now = Date.now()
    const windowMs = rule.window * 1000
    const data = store.get(key)

    if (!data || now - data.lastRequest > windowMs) {
      if (amount > rule.max) return { allowed: false, retryAfter: rule.window }
      sweepExpired(now)
      store.set(key, { key, count: amount, lastRequest: now, expiresAt: now + windowMs })
      return { allowed: true, retryAfter: null }
    }
    if (data.count + amount > rule.max) {
      return { allowed: false, retryAfter: retryAfter(data.lastRequest, rule.window) }
    }
    data.count += amount
    data.lastRequest = now
    data.expiresAt = now + windowMs
    return { allowed: true, retryAfter: null }
  }

  return {
    async consume(key, rule, amount = 1) {
      if (redis) {
        try {
          return await consumeViaRedis(redis, key, rule, amount)
        } catch (error) {
          // Graceful degradation: fall back to the bounded in-memory limiter if Redis is unreachable,
          // but signal it (ADR-0107 H5) — the fallback is per-process and weaker, never a silent drop.
          signalDegraded(error)
        }
      }
      return consumeInMemory(key, rule, amount)
    },
    clear() {
      store.clear()
    },
    close() {
      redis?.disconnect()
    },
  }
}
