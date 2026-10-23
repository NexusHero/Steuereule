// A resettable in-memory rate-limit storage for better-auth (ADR-0035). The
// `RateLimit` table that better-auth's `storage: 'database'` used was removed with
// the three hand-rolled limiters, so better-auth's rate limiter moves to memory.
// better-auth's built-in memory store is a module-level Map this app cannot clear,
// so its acceptance tests — which reset the limiter between tests exactly as they
// used to clear the `RateLimit` table — would trip a spurious 429. This plugs into
// better-auth's documented `rateLimit.customStorage` extension point (the same seam
// a Redis backend would use) to provide an atomic, sliding-window in-memory store
// plus a `clear()` the tests call.
//
// `consume` mirrors better-auth's own `decideConsume`
// (`better-auth/dist/api/rate-limiter/index.mjs`) — read-decide-write in one
// synchronous step, so two concurrent requests cannot both pass a stale read. It is
// implemented here (rather than leaving `consume` absent and letting better-auth's
// non-atomic `legacyConsume` fall back to `get`/`set`) because dropping the atomic
// increment would silently weaken the concurrency guarantee the removed DB-backed
// limiter had.
//
// Known limitation (deliberate, not fixed here): the `Map` below grows unbounded in a
// long-lived process — one entry per seen `${ip}|${path}` key. better-auth's built-in
// memory store also prunes expired entries (`Date.now() >= expiresAt`) and caps itself
// at `MEMORY_STORE_MAX_ENTRIES = 1e5`; this store does neither. That is not a
// correctness bug — an expired key is correctly reset to `count: 1` on its next
// `consume` — but an unbounded-memory regression versus the built-in store. Resolved by
// the Redis-backed follow-up (gated on #292), not here; see
// `.scratch/roadmap-1.0/issues/13-e2e-harness-rate-limit-umstellung.md`.
import type { BetterAuthRateLimitStorage } from 'better-auth'

export interface ResettableRateLimitStorage extends BetterAuthRateLimitStorage {
  clear(): void
}

function retryAfter(lastRequest: number, windowSeconds: number): number {
  return Math.ceil((lastRequest + windowSeconds * 1000 - Date.now()) / 1000)
}

export function createResettableRateLimitStorage(): ResettableRateLimitStorage {
  const store = new Map<string, { key: string; count: number; lastRequest: number }>()

  return {
    // `get`/`set` are only reached by better-auth's non-atomic `legacyConsume`
    // fallback, which is not used while `consume` is present — kept for interface
    // completeness.
    async get(key) {
      return store.get(key) ?? null
    },
    async set(key, value) {
      store.set(key, { key: value.key, count: value.count, lastRequest: value.lastRequest })
    },
    async consume(key, rule) {
      const now = Date.now()
      const windowMs = rule.window * 1000
      const data = store.get(key)

      // Same three branches as better-auth's own `decideConsume`: first ever /
      // window-elapsed → reset to count 1; at/over max → block; else increment and
      // slide the window.
      if (!data || now - data.lastRequest > windowMs) {
        store.set(key, { key, count: 1, lastRequest: now })
        return { allowed: true, retryAfter: null }
      }
      if (data.count >= rule.max) {
        return { allowed: false, retryAfter: retryAfter(data.lastRequest, rule.window) }
      }
      data.count += 1
      data.lastRequest = now
      return { allowed: true, retryAfter: null }
    },
    clear() {
      store.clear()
    },
  }
}
