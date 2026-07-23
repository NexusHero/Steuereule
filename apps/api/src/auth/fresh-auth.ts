// Fresh-auth re-verification seam for destructive actions (ADR-0013 §6). Reuses
// better-auth for both halves — never a second, hand-rolled auth mechanism:
//   - `auth.api.getSession()` (the exact call UserContextGuard already makes) to read
//     the real session's `createdAt`, so a recently-established session can skip
//     password re-entry ("fresh-session assertion").
//   - `auth.api.verifyPassword()` — better-auth's own current-password check — when
//     the session isn't fresh enough, reusing its scrypt verification rather than
//     re-deriving one here.
//
// Deliberately NOT `auth.api.signInEmail`: that mints a brand-new session as a side
// effect, which would be a strange thing to do half a second before deleting the
// account entirely. `verifyPassword` checks the password against the *already
// authenticated* session's user with no side effect beyond the check itself.
import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import { APIError } from 'better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import type { BetterAuthBundle } from './auth.tokens.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { consumeVerifyPasswordRateLimit } from './verify-password-rate-limit.js'

/**
 * How recently the caller's real better-auth session must have been established to
 * skip password re-entry before a destructive action. Deliberately much shorter than
 * better-auth's own general-purpose `session.freshAge` (defaults to 24h — sized for
 * routine sensitive-but-reversible actions like changing an email) — account deletion
 * is irrecoverable, so "fresh" here means minutes, not a whole day.
 */
export const ACCOUNT_DELETE_FRESH_WINDOW_MS = 5 * 60 * 1000

export class GuestSessionCannotDeleteAccountError extends ForbiddenException {
  constructor() {
    super('Account deletion requires a signed-in account, not a guest session.')
  }
}

export class FreshAuthRequiredError extends BadRequestException {
  constructor() {
    super('Your session is not fresh enough for this destructive action — re-enter your password.')
  }
}

export class FreshAuthFailedError extends UnauthorizedException {
  constructor() {
    super('Password re-verification failed.')
  }
}

@Injectable()
export class FreshAuthChecker {
  // Explicit token — see the comment on ProfileController's constructor for why.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Throws unless the caller both (a) holds a genuine better-auth account session for
   * `expectedUserId` (never merely a guest cookie) and (b) has proven that session is
   * either fresh, or re-verified via password. Never returns a value — a clean
   * resolve is the only "ok" signal, mirroring UserContextGuard's own throw-or-proceed
   * shape.
   */
  async assertFreshAuth(
    betterAuth: BetterAuthBundle,
    headers: IncomingHttpHeaders,
    expectedUserId: string,
    password: string | undefined,
  ): Promise<void> {
    const fetchHeaders = fromNodeHeaders(headers)
    const session = await betterAuth.auth.api.getSession({ headers: fetchHeaders })

    // A guest (no real better-auth session) has no better-auth `User` row to tear
    // down — there is nothing here for this endpoint to do.
    if (!session) throw new GuestSessionCannotDeleteAccountError()

    // Defense-in-depth: UserContextGuard already resolved this same session for
    // @CurrentUser(); this must always agree with it. A mismatch would mean the guard
    // and this direct re-check somehow disagree, which must never silently proceed.
    if (session.user.id !== expectedUserId) throw new GuestSessionCannotDeleteAccountError()

    const createdAt = new Date(session.session.createdAt).getTime()
    const isFresh = Date.now() - createdAt < ACCOUNT_DELETE_FRESH_WINDOW_MS
    if (isFresh) return

    if (!password) throw new FreshAuthRequiredError()

    // Rate-limit the re-verification attempt itself, keyed per account, before ever
    // touching the password. `auth.api.verifyPassword()` below is an in-process call,
    // not a request through the mounted `/api/auth/*` router — better-auth's own
    // rate-limit check runs in that router's `onRequest` hook (see
    // verify-password-rate-limit.ts's header comment) and never sees this call, so it
    // cannot be relied on here. This consults the same DB-backed `RateLimit` table
    // directly instead (ADR-0013 §6: reuse the existing table, no new mechanism).
    await consumeVerifyPasswordRateLimit(this.prisma, `delete-account-verify-password:${expectedUserId}`)

    try {
      // Reuses better-auth's own `/verify-password` endpoint (its scrypt check) —
      // never a second, hand-rolled password check.
      await betterAuth.auth.api.verifyPassword({ headers: fetchHeaders, body: { password } })
    } catch (error) {
      if (error instanceof APIError) throw new FreshAuthFailedError()
      throw error
    }
  }
}
