// Rate-limits `POST /v1/device/code` (#238, ADR-0024, Musti's PR #239 ruling). The
// endpoint is unauthenticated by design (the desktop requesting a code has no
// identity yet — see device.service.ts's header comment) and mints a permanent row
// with no sweeper (deliberately out of scope here — a cleanup mechanism needs a
// scheduler, `@nestjs/schedule` is not a current dependency, and adopting one is an
// architecture decision that belongs to NexusHero, tracked as its own ticket).
//
// NOT an entropy-margin argument: an attacker-minted code points at the attacker's
// own desktop, so flooding this endpoint adds nothing to the pool a guessing attack
// against `/v1/device/pending` could actually profit from (see ADR-0024's corrected
// §3 and the PR #239 ruling for the full reasoning the earlier draft got wrong). The
// reason this limit exists is write-amplification: an unthrottled, unauthenticated
// process minting one row per call writes ~14.9 GB/day into the same database that
// holds every user's encrypted tax data (measured directly against real Postgres,
// PR #239). Window 60s / max 10 per key bounds that to ~8.2 MB/day per source.
//
// Same shared algorithm as device-pending-rate-limit.ts / verify-password-rate-limit.ts
// (consumeDbRateLimit, the RateLimit table) — a third reuse, not a new mechanism.
import { HttpException, HttpStatus } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { consumeDbRateLimit } from '../auth/db-rate-limit.js'

export const DEVICE_CODE_RATE_LIMIT_WINDOW_MS = 60_000
export const DEVICE_CODE_RATE_LIMIT_MAX = 10

export class TooManyDeviceCodeRequestsError extends HttpException {
  constructor() {
    super('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS)
  }
}

export async function consumeDeviceCodeRateLimit(prisma: PrismaClient, key: string, now: number = Date.now()): Promise<void> {
  const allowed = await consumeDbRateLimit(prisma, key, { windowMs: DEVICE_CODE_RATE_LIMIT_WINDOW_MS, max: DEVICE_CODE_RATE_LIMIT_MAX }, now)
  if (!allowed) throw new TooManyDeviceCodeRequestsError()
}
