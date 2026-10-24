// The one place this app's HTTP-layer rate limits are declared, so the three
// routes they protect can't drift from each other's window/max by hand-copying
// numbers at each call site. All three are now enforced by `@nestjs/throttler`
// (the framework standard — ADR-0035) instead of the removed hand-rolled
// DB-backed `consumeDbRateLimit` limiters and the `RateLimit` table.
//
// Storage is throttler's in-memory default, not a database: a limit that resets
// per pod can be spread across pods on a horizontally-scaled deployment. That
// trade-off is a documented deviation from ADR-0012 §5's "DB-backed" wording —
// see the follow-up note in `.scratch/roadmap-1.0/issues/02-*.md` (restore
// cross-pod consistency via Redis once the infra track lands it), not a silent
// weakening: the per-request write-amplification bound the device-code limiter
// exists for (PR #239) still holds per source per pod.
import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler'
import { USER_ID_REQUEST_KEY, type RequestWithUserId } from '../auth/user-context.guard.js'

// POST /v1/device/code — unauthenticated, IP-keyed, bounds write-amplification
// against the database (60s / 10 per key, PR #239). Window/max are the exact
// values the removed device-code-rate-limit.ts enforced.
export const DEVICE_CODE_THROTTLE = { ttl: 60_000, limit: 10 } as const

// GET /v1/device/pending — unauthenticated, IP-keyed, the externally-reachable
// code-guessing surface (60s / 10 per IP, ADR-0024). Same intensity as the code
// mint above; a distinct route, so a distinct throttler bucket.
export const DEVICE_PENDING_THROTTLE = { ttl: 60_000, limit: 10 } as const

// DELETE /v1/account password re-verification — keyed per account, not per IP,
// matching the removed verify-password-rate-limit.ts. Window/max are the same
// strictness better-auth applies to /sign-in* (10s / 3). A shared-IP caller must
// not consume another account's budget, and an IP-rotating attacker must not
// reset their own — both are why this tracker reads the resolved userId rather
// than `req.ip`.
export const VERIFY_PASSWORD_THROTTLE = { ttl: 10_000, limit: 3 } as const

/**
 * Keys the DELETE /v1/account throttle on the userId UserContextGuard already
 * resolved, falling back to the socket IP only for the (impossible, guarded)
 * case where no guard ran first. The account-deletion controller registers the
 * ThrottlerGuard at route scope, so UserContextGuard (controller scope) runs
 * before it and `request[USER_ID_REQUEST_KEY]` is already set.
 */
export const verifyPasswordTracker: ThrottlerGetTrackerFunction = (req) => {
  const userId = (req as RequestWithUserId)[USER_ID_REQUEST_KEY]
  return userId ?? (req as { ip?: string }).ip ?? 'no-ip'
}
