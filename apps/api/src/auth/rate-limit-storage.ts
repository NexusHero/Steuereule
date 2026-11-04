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
    async consume(key, rule) {
      const now = Date.now()
      const windowMs = rule.window * 1000
      const data = store.get(key)

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
