// Account-keyed sign-in rate limiting (REQ-010, #248/#292) — a control that closes
// the part of "repeated failed logins from the same account" that does NOT depend on
// trusting the caller's IP. Full design reasoning, alternatives considered and the
// still-open availability trade-off live in **ADR-0035** — this file is the
// implementation, not the decision record.
//
// Two hooks, not one, because "was this attempt a failure" is only known *after* the
// endpoint runs (Musti's review, PR #339, blocking finding 1): `hooks.before` only
// ever PEEKS at the current count and blocks if already over quota — it never writes,
// so it cannot itself lock anyone out. `hooks.after` inspects the real outcome
// (`ctx.context.returned`, better-auth's own post-dispatch result) and only THEN
// writes: a failed attempt (`isAPIError`) increments the bucket; a success clears it
// outright. That is what makes the limiter match REQ-010's own wording — "repeated
// FAILED logins" — rather than counting every attempt, successes included.
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import type { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { consumeDbRateLimit, peekDbRateLimit, resetDbRateLimit } from './db-rate-limit.js'

/**
 * Looser than better-auth's own IP-keyed special rule for /sign-in* (10s/max 3): this
 * bucket is shared by every caller regardless of source, honest or not, so it must
 * tolerate a legitimate account holder mistyping a password a few times from a
 * shared/rotating network without becoming a denial-of-service tool against a target
 * the attacker never has to authenticate as. See ADR-0035 for why 60s/5, and for the
 * lockout exposure this value does NOT close (open, pending stakeholder ruling).
 */
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000
export const LOGIN_RATE_LIMIT_MAX = 5

const SIGN_IN_EMAIL_PATH = '/sign-in/email'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * `login-attempts|<sha256-hex-of-normalized-email>` — a FIXED-length key (this prefix
 * plus exactly 64 hex chars), regardless of how long or malformed the input is.
 *
 * Not `login-attempts|<email>` verbatim: Musti's review (PR #339, blocking finding 2)
 * measured a 5000-char non-email request body writing a 5015-char `RateLimit.key` row
 * before the endpoint's own zod schema ever gets a chance to reject it (this hook runs
 * in `hooks.before`, ahead of body validation) — an unauthenticated caller could grow
 * an unindexed, unpruned table without bound, for free, on the exact route that by
 * definition accepts traffic from anyone. Hashing removes the size dimension entirely:
 * every key this function can produce is the same length, so the growth vector is
 * "one row per distinct normalized email tried", not "one row per byte sent".
 */
export function loginRateLimitKey(email: string): string {
  const digest = createHash('sha256').update(normalizeEmail(email)).digest('hex')
  return `login-attempts|${digest}`
}

function signInAttemptEmail(ctx: { path?: string; body?: unknown }): string | null {
  if (ctx.path !== SIGN_IN_EMAIL_PATH) return null
  const body = ctx.body as { email?: unknown } | undefined
  return typeof body?.email === 'string' ? body.email : null
}

function tooManyAttemptsError(): APIError {
  return new APIError('TOO_MANY_REQUESTS', {
    message: 'Too many sign-in attempts for this account. Please try again later.',
  })
}

/**
 * `hooks.before` half: read-only. Blocks a `/sign-in/email` attempt before credential
 * validation ever runs if the account-keyed bucket is already at/over quota — never
 * writes, so it cannot be the thing that counts a success (that was the defect: see
 * `createLoginRateLimitAfterHook` for where counting actually happens now).
 */
export function createLoginRateLimitBeforeHook(prisma: PrismaClient): ReturnType<typeof createAuthMiddleware> {
  return createAuthMiddleware(async (ctx) => {
    const email = signInAttemptEmail(ctx)
    if (!email) return // malformed/missing body — the endpoint's own zod schema rejects this next; nothing to key on

    const allowed = await peekDbRateLimit(prisma, loginRateLimitKey(email), {
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      max: LOGIN_RATE_LIMIT_MAX,
    })
    if (!allowed) throw tooManyAttemptsError()
  })
}

/**
 * `hooks.after` half: the only place this control writes. Runs once better-auth has
 * resolved the endpoint's real outcome into `ctx.context.returned` (an `APIError` on
 * failure, the session/user payload on success — `dispatchAuthEndpoint`,
 * `better-auth/dist/api/dispatch.mjs`). A failed attempt consumes one unit of quota; a
 * successful one clears the bucket outright, so a legitimate account holder's own
 * correct sign-ins never accumulate against — or get denied by — this limiter.
 *
 * Never runs at all for a request the before-hook already blocked (better-auth's
 * dispatch pipeline short-circuits on a before-hook response — the endpoint and every
 * after-hook are skipped), so a blocked attempt cannot double-count here either.
 */
export function createLoginRateLimitAfterHook(prisma: PrismaClient): ReturnType<typeof createAuthMiddleware> {
  return createAuthMiddleware(async (ctx) => {
    const email = signInAttemptEmail(ctx)
    if (!email) return

    const key = loginRateLimitKey(email)
    if (isAPIError(ctx.context.returned)) {
      await consumeDbRateLimit(prisma, key, { windowMs: LOGIN_RATE_LIMIT_WINDOW_MS, max: LOGIN_RATE_LIMIT_MAX })
    } else {
      await resetDbRateLimit(prisma, key)
    }
  })
}
