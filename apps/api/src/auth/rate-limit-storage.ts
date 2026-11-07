import type { BetterAuthRateLimitStorage } from 'better-auth'

export interface ResettableRateLimitStorage extends BetterAuthRateLimitStorage {
  clear(): void
}

const SWEEP_THRESHOLD = 1_000
const MAX_STORE_ENTRIES = 10_000

function retryAfter(lastRequest: number, windowSeconds: number): number {
  return Math.ceil((lastRequest + windowSeconds * 1000 - Date.now()) / 1000)
}

export function createResettableRateLimitStorage(): ResettableRateLimitStorage {
  const store = new Map<string, { key: string; count: number; lastRequest: number; expiresAt: number }>()

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

  return {
    async consume(key, rule) {
      const now = Date.now()
      const windowMs = rule.window * 1000
      const data = store.get(key)

      if (!data || now - data.lastRequest > windowMs) {
        sweepExpired(now)
        store.set(key, { key, count: 1, lastRequest: now, expiresAt: now + windowMs })
        return { allowed: true, retryAfter: null }
      }
      if (data.count >= rule.max) {
        return { allowed: false, retryAfter: retryAfter(data.lastRequest, rule.window) }
      }
      data.count += 1
      data.lastRequest = now
      data.expiresAt = now + windowMs
      return { allowed: true, retryAfter: null }
    },
    clear() {
      store.clear()
    },
  }
}
