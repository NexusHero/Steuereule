// The generic DB-backed rate-limit algorithm (ADR-0012 §5), extracted from
// verify-password-rate-limit.ts so #238 task 2's `/v1/device/pending` limiter can
// reuse the exact same concurrency-safe conditional-UPDATE shape rather than a
// second hand-rolled copy — see that file's own header comment for *why* an
// in-process `auth.api.*` caller needs this at all (better-auth's own router-bound
// rate limiter never sees a direct `auth.api.X()` call).
//
// Same read → conditional-increment-if-still-under-max-and-in-window → reset-if-
// window-elapsed → create-if-absent algorithm as better-auth's own database storage
// adapter (`better-auth/dist/api/rate-limiter/index.mjs`'s
// `createDatabaseStorageWrapper`) — same table (`RateLimit`), same storage shape, no
// new mechanism, just a shared implementation for every caller that needs it from
// outside the HTTP router.
import type { PrismaClient } from '@prisma/client'

export interface DbRateLimitConfig {
  windowMs: number
  max: number
}

/**
 * Atomically consumes one attempt against `key`'s rolling window. Returns `true` if
 * the attempt is allowed (and has been counted), `false` if the caller is over the
 * limit — deliberately a boolean return, not a throw: callers decide what "blocked"
 * means for their own endpoint (a 429 with generic wording, or the RFC 8628
 * `slow_down`-shaped body `/v1/device/pending` needs).
 */
export async function consumeDbRateLimit(
  prisma: PrismaClient,
  key: string,
  config: DbRateLimitConfig,
  now: number = Date.now(),
): Promise<boolean> {
  const windowStart = now - config.windowMs

  // Conditional increment: only matches (and bumps) a row that is both still inside
  // its window and still under the max — an atomic single-statement UPDATE, so two
  // concurrent requests can't both read "count N-1 of N" and both proceed.
  const incremented = await prisma.rateLimit.updateMany({
    where: { key, lastRequest: { gt: windowStart }, count: { lt: config.max } },
    data: { count: { increment: 1 }, lastRequest: now },
  })
  if (incremented.count > 0) return true

  const existing = await prisma.rateLimit.findFirst({ where: { key } })

  if (!existing) {
    // Never seen this key before — first attempt, definitely allowed.
    await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: now } })
    return true
  }

  const lastRequest = Number(existing.lastRequest ?? 0)
  if (now - lastRequest > config.windowMs) {
    // The window has elapsed since the row was last touched — reset it, conditioned
    // on `lastRequest` not having moved since we read it (best-effort race guard; a
    // concurrent resetter racing this one just means both land on a fresh window,
    // which is the correct outcome either way).
    await prisma.rateLimit.updateMany({
      where: { key, lastRequest: { lte: lastRequest } },
      data: { count: 1, lastRequest: now },
    })
    return true
  }

  // Still inside the window and already at/over the max — blocked.
  return false
}
