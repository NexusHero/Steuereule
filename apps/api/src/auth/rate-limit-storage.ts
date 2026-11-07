import { createConnection } from 'node:net'
import { connect as createTlsConnection } from 'node:tls'
import type { BetterAuthRateLimitStorage } from 'better-auth'

export interface ResettableRateLimitStorage extends BetterAuthRateLimitStorage {
  clear(): void
}

export interface RateLimitStorageOptions {
  redisUrl?: string | undefined
}

const SWEEP_THRESHOLD = 1_000
const MAX_STORE_ENTRIES = 10_000
const REDIS_TIMEOUT_MS = 400

function retryAfter(lastRequest: number, windowSeconds: number): number {
  return Math.ceil((lastRequest + windowSeconds * 1000 - Date.now()) / 1000)
}

function encodeRespCommand(args: readonly string[]): string {
  let out = `*${args.length}\r\n`
  for (const arg of args) {
    out += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`
  }
  return out
}

const LUA_RATE_LIMIT_SCRIPT =
  'local c = redis.call("INCR", KEYS[1]); if c == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end; local ttl = redis.call("PTTL", KEYS[1]); return {c, ttl}'

async function consumeViaRedis(
  redisUrl: string,
  key: string,
  rule: { window: number; max: number },
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const parsed = new URL(redisUrl)
  const isTls = parsed.protocol === 'rediss:'
  const host = parsed.hostname || '127.0.0.1'
  const port = Number(parsed.port || (isTls ? 6380 : 6379))
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined
  const username = parsed.username ? decodeURIComponent(parsed.username) : undefined
  const windowMs = String(rule.window * 1000)
  const redisKey = `steuereule:rl:${key}`

  return new Promise((resolve, reject) => {
    const socket = isTls
      ? createTlsConnection({ host, port, servername: host })
      : createConnection({ host, port })

    let buffer = ''
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      socket.destroy()
      fn()
    }

    socket.setTimeout(REDIS_TIMEOUT_MS, () => {
      finish(() => reject(new Error('Redis rate-limit timeout')))
    })
    socket.on('error', (err) => {
      finish(() => reject(err))
    })

    socket.on('connect', () => {
      let payload = ''
      if (password) {
        payload += encodeRespCommand(username ? ['AUTH', username, password] : ['AUTH', password])
      }
      payload += encodeRespCommand(['EVAL', LUA_RATE_LIMIT_SCRIPT, '1', redisKey, windowMs])
      socket.write(payload)
    })

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      // Look for the array reply `*2\r\n:<count>\r\n:<pttl>\r\n`
      const match = /\*2\r\n:(\d+)\r\n:(-?\d+)\r\n/.exec(buffer)
      if (!match) return
      const count = Number(match[1])
      const pttl = Number(match[2])
      finish(() => {
        if (count > rule.max) {
          const retrySecs = pttl > 0 ? Math.ceil(pttl / 1000) : rule.window
          resolve({ allowed: false, retryAfter: retrySecs })
        } else {
          resolve({ allowed: true, retryAfter: null })
        }
      })
    })
  })
}

export function createResettableRateLimitStorage(
  options: RateLimitStorageOptions = {},
): ResettableRateLimitStorage {
  const store = new Map<string, { key: string; count: number; lastRequest: number; expiresAt: number }>()
  const configuredRedisUrl = options.redisUrl ?? process.env.REDIS_URL

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

  function consumeInMemory(key: string, rule: { window: number; max: number }) {
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
  }

  return {
    async consume(key, rule) {
      if (configuredRedisUrl) {
        try {
          return await consumeViaRedis(configuredRedisUrl, key, rule)
        } catch {
          // Graceful degradation: fall back to bounded in-memory limiter if Redis is unreachable.
        }
      }
      return consumeInMemory(key, rule)
    },
    clear() {
      store.clear()
    },
  }
}
