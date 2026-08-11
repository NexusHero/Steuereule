// Account-keyed sign-in rate limiting (REQ-010, #248/#292) — a control that closes
// the part of "repeated failed logins from the same account" that does NOT depend on
// trusting the caller's IP.
//
// Why this exists, not merely "another rate limiter": better-auth's own built-in
// limiter (see better-auth.ts's `rateLimit` block) keys on `${ip}|${path}`
// (`createRateLimitKey`, @better-auth/core). Every IP it resolves is only as
// trustworthy as the network in front of it, and today there is no such network
// (#292 — no deployment exists to inspect real proxy CIDRs, #277). Two DISTINCT,
// independently-measured failure shapes follow from that, not one:
//
//   A1 (#241/#292, `trusted-proxies-ip-resolution.test.ts`) — a caller who DOES send
//   an X-Forwarded-For header controls its value outright; a different value per
//   request buys a fresh IP-keyed bucket every time. Configuring
//   `advanced.ipAddress.trustedProxies` does NOT close this for a single-value
//   header — there is nothing to its right to strip (see trusted-proxies.ts's own
//   header comment, and useDeviceSessions.ts's identical finding for
//   `Session.ipAddress`/region). Only a network property — the app being
//   unreachable except through a real trusted proxy — closes it, and that property
//   does not exist yet.
//
//   A0 (measured directly against the real stack while diagnosing this ticket,
//   `trusted-proxies-ip-resolution.test.ts`'s own A0 case) — a caller who sends NO
//   X-Forwarded-For header at all (the actual shape of every request in this
//   project's CI `Browser gates`/`smoke` jobs: no reverse proxy sits in front of
//   `node --import tsx dist/main.js` there) makes `getIp()` return `null`.
//   better-auth's own fallback for that is a SINGLE literal key,
//   `no-trusted-ip|<path>` — shared by every caller, not fresh per caller. Measured
//   directly: two entirely unrelated target accounts (`target-0@example.com`,
//   `target-1@example.com`) alternately probed with no XFF header exhaust the SAME
//   three-request bucket and start seeing 429s from the fourth combined request,
//   regardless of which account each individual request named. This is the exact
//   shape Salih measured making CI's `Browser gates` job fail — real, not
//   theoretical, and the literal mechanism behind the
//   "Rate limiting could not determine a client IP..." warning every CI run logs.
//
// Neither shape is closable by any `TRUSTED_PROXIES` value configurable today — both
// need the real deployment topology (#292) to even ask the question "which hop do we
// trust". What CAN be built without it: a SECOND limiter that keys on something an
// attacker cannot rotate per-request the way they can an HTTP header — the account
// being attacked. An attacker who defeats the IP-keyed limiter entirely (A1: a fresh
// XFF value every request) still cannot make the attempt stop counting against the
// one email they are guessing passwords for. This does not make `Session.ipAddress`
// or the IP-keyed bucket trustworthy — it sidesteps the question for the one clause
// of REQ-010 that does not actually require an honest IP: "repeated failed logins
// from the same account."
//
// Reuses the exact same DB-backed, concurrency-safe algorithm every other in-process
// limiter in this codebase already uses (db-rate-limit.ts) — no new mechanism,
// matching ADR-0013 §6's own instruction for `/verify-password`.
import { APIError } from 'better-auth/api'
import { createAuthMiddleware } from 'better-auth/api'
import type { PrismaClient } from '@prisma/client'
import { consumeDbRateLimit } from './db-rate-limit.js'

/**
 * Looser than better-auth's own IP-keyed special rule for /sign-in* (10s/max 3):
 * this bucket is shared by every caller regardless of source, honest or not, so it
 * must tolerate a legitimate account holder mistyping a password a few times from a
 * shared/rotating network (mobile carrier NAT, corporate egress) without becoming a
 * denial-of-service tool against a target the attacker never has to authenticate as
 * — anyone can name any email in a sign-in attempt. 60s/5 still bounds a sustained
 * credential-stuffing run against one account to ~5 guesses/minute regardless of how
 * many source IPs (real or spoofed) the attempts are spread across.
 */
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000
export const LOGIN_RATE_LIMIT_MAX = 5

const SIGN_IN_EMAIL_PATH = '/sign-in/email'

/** Exported for the key format to be asserted directly in tests, the same way
 *  `trusted-proxies-ip-resolution.test.ts`'s A2 asserts `RateLimit.key` literally
 *  rather than merely "some row exists". */
export function loginRateLimitKey(email: string): string {
  return `login-attempts|${email.trim().toLowerCase()}`
}

/**
 * Builds the `hooks.before` handler that enforces the account-keyed limiter. Wired
 * as better-auth's top-level `hooks.before` (better-auth.ts) — matched on every
 * endpoint call (better-auth's own `getHooks()` gives it `matcher: () => true`), so
 * it must gate on `ctx.path` itself and return for anything other than sign-in.
 *
 * Runs BEFORE the endpoint's own internal middleware chain (origin/CSRF check —
 * `dispatchAuthEndpoint` runs `hooks.before` ahead of `endpoint(...)`, measured
 * directly against the real dispatch code, not assumed), so a request rejected here
 * never reaches better-auth's origin check either. That is the same ordering the
 * existing router-bound IP limiter already has (#248's own finding: it runs before
 * `originCheckMiddleware` too) — this control does not introduce a new ordering
 * risk, it shares the one that already exists.
 */
export function createLoginRateLimitHook(prisma: PrismaClient): ReturnType<typeof createAuthMiddleware> {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_IN_EMAIL_PATH) return

    const email = typeof ctx.body?.email === 'string' ? ctx.body.email : null
    if (!email) return // malformed body — the endpoint's own zod schema rejects this next; nothing to key on

    const allowed = await consumeDbRateLimit(prisma, loginRateLimitKey(email), {
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      max: LOGIN_RATE_LIMIT_MAX,
    })
    if (!allowed) {
      throw new APIError('TOO_MANY_REQUESTS', {
        message: 'Too many sign-in attempts for this account. Please try again later.',
      })
    }
  })
}
