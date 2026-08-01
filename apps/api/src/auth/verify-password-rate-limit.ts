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
// existed.
//
// The actual read/window/increment algorithm now lives in db-rate-limit.ts (#238 task
// 2 extracted it so `/v1/device/pending`'s limiter — the same in-process-caller gap,
// for the same reason — doesn't need a second hand-rolled copy). This file keeps its
// own public name/error type/intensity constants unchanged; every existing caller
// (FreshAuthChecker) is unaffected.
import { HttpException, HttpStatus } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { consumeDbRateLimit } from './db-rate-limit.js'

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
 * Atomically consumes one attempt against `key`'s rolling window (see
 * db-rate-limit.ts for the algorithm). Throws `TooManyFreshAuthAttemptsError` (429)
 * when the caller is over the limit; resolves silently otherwise.
 */
export async function consumeVerifyPasswordRateLimit(
  prisma: PrismaClient,
  key: string,
  now: number = Date.now(),
): Promise<void> {
  const allowed = await consumeDbRateLimit(prisma, key, { windowMs: VERIFY_PASSWORD_RATE_LIMIT_WINDOW_MS, max: VERIFY_PASSWORD_RATE_LIMIT_MAX }, now)
  if (!allowed) throw new TooManyFreshAuthAttemptsError()
}
