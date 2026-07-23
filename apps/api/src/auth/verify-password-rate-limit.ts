// Reuses the existing DB-backed `RateLimit` table (ADR-0012 §5) to rate-limit the
// DELETE /v1/account fresh-auth password re-verification step (ADR-0013 §6: "rate-
// limited by reusing the existing DB-backed RateLimit table — no new mechanism").
//
// Why this exists rather than leaning on better-auth's own built-in rate limiter:
// FreshAuthChecker calls `betterAuth.auth.api.verifyPassword({ headers, body })`
// directly (an in-process function call), not over HTTP through the mounted
// `/api/auth/*` Fastify catch-all. better-auth's `onRequestRateLimit` check runs in
// the router's `onRequest` hook (see `router()` in better-auth's `api/index.mjs`) —
// it is **not** invoked when an endpoint is called directly via `auth.api.X()`. That
// gap was caught for real: the REQ-011 acceptance test drove 12 wrong-password
// DELETE attempts against a real server and none of them tripped 429 before this file
// existed. Rather than round-tripping through better-auth's HTTP router just to pick
// up its middleware (a much heavier, network-shaped fix for an in-process call), this
// consults the *same* `RateLimit` table directly with the same read/window/increment
// shape better-auth's own database storage adapter uses (see
// `better-auth/dist/api/rate-limiter/index.mjs`'s `createDatabaseStorageWrapper`) —
// same table, same storage-shape, no new table/dependency/mechanism, just one more
// caller of it for a call path the framework's own router-bound limiter cannot reach.
import { HttpException, HttpStatus } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'

/** Same intensity as better-auth's own built-in special rule for /sign-in*, /sign-up*,
 *  /change-password, /change-email (`getDefaultSpecialRules()`) — a destructive,
 *  password-guessable action deserves at least that same strictness. */
export const VERIFY_PASSWORD_RATE_LIMIT_WINDOW_MS = 10_000
export const VERIFY_PASSWORD_RATE_LIMIT_MAX = 3

export class TooManyFreshAuthAttemptsError extends HttpException {
  constructor() {
    super('Too many password re-verification attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS)
  }
}

/**
 * Atomically consumes one attempt against `key`'s rolling window, mirroring
 * better-auth's own conditional-`UPDATE`-based algorithm (read → conditional
 * increment-if-still-under-max-and-in-window → fall back to reset-if-window-elapsed →
 * create-if-absent), so concurrent requests can't all read a stale count before any
 * write lands. Throws `TooManyFreshAuthAttemptsError` (429) when the caller is over
 * the limit; resolves silently otherwise.
 */
export async function consumeVerifyPasswordRateLimit(
  prisma: PrismaClient,
  key: string,
  now: number = Date.now(),
): Promise<void> {
  const windowStart = now - VERIFY_PASSWORD_RATE_LIMIT_WINDOW_MS

  // Conditional increment: only matches (and bumps) a row that is both still inside
  // its window and still under the max — an atomic single-statement UPDATE, so two
  // concurrent requests can't both read "count 2 of 3" and both proceed.
  const incremented = await prisma.rateLimit.updateMany({
    where: { key, lastRequest: { gt: windowStart }, count: { lt: VERIFY_PASSWORD_RATE_LIMIT_MAX } },
    data: { count: { increment: 1 }, lastRequest: now },
  })
  if (incremented.count > 0) return

  const existing = await prisma.rateLimit.findFirst({ where: { key } })

  if (!existing) {
    // Never seen this key before — first attempt, definitely allowed.
    await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: now } })
    return
  }

  const lastRequest = Number(existing.lastRequest ?? 0)
  if (now - lastRequest > VERIFY_PASSWORD_RATE_LIMIT_WINDOW_MS) {
    // The window has elapsed since the row was last touched — reset it, conditioned
    // on `lastRequest` not having moved since we read it (best-effort race guard; a
    // concurrent resetter racing this one just means both land on a fresh window,
    // which is the correct outcome either way).
    await prisma.rateLimit.updateMany({
      where: { key, lastRequest: { lte: lastRequest } },
      data: { count: 1, lastRequest: now },
    })
    return
  }

  // Still inside the window and already at/over the max — blocked.
  throw new TooManyFreshAuthAttemptsError()
}
