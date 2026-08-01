// Rate-limits `GET /v1/device/pending` — the *actual* externally-reachable surface a
// code-guessing attacker would hit (#238 task 2, ADR-0024). Named and sized exactly
// as the ADR's `customRules['/device']` entry in better-auth.ts, which that file's
// own comment documents as inert for this purpose: better-auth's router-bound
// limiter never sees this endpoint's in-process `auth.api.deviceVerify()` call, the
// same gap `verify-password-rate-limit.ts` already found and fixed for
// `/verify-password`. This is that fix's counterpart for `/device`.
//
// Window 60s / max 10, keyed per client IP: against the default `generateUserCode`'s
// 40 bits of entropy, that's ~0.17 guesses/s — even at 100k codes pending
// simultaneously, the expected time to a guessed hit stays in years (Musti's #238
// review, §3).
import { HttpException, HttpStatus } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { consumeDbRateLimit } from '../auth/db-rate-limit.js'

export const DEVICE_PENDING_RATE_LIMIT_WINDOW_MS = 60_000
export const DEVICE_PENDING_RATE_LIMIT_MAX = 10

export class TooManyDevicePendingRequestsError extends HttpException {
  constructor() {
    super('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS)
  }
}

export async function consumeDevicePendingRateLimit(prisma: PrismaClient, key: string, now: number = Date.now()): Promise<void> {
  const allowed = await consumeDbRateLimit(
    prisma,
    key,
    { windowMs: DEVICE_PENDING_RATE_LIMIT_WINDOW_MS, max: DEVICE_PENDING_RATE_LIMIT_MAX },
    now,
  )
  if (!allowed) throw new TooManyDevicePendingRequestsError()
}
