import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import { APIError } from 'better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import type { BetterAuthBundle } from './auth.tokens.js'
import { STEP_UP_GRANT_REPOSITORY, type StepUpGrantRepository } from './step-up-grant.repository.js'
import { assertStepUp, StepUpRefusedError, STEP_UP_WINDOW_MS } from './step-up-policy.js'

export const ACCOUNT_DELETE_FRESH_WINDOW_MS = STEP_UP_WINDOW_MS

export class GuestSessionCannotDeleteAccountError extends ForbiddenException {
  constructor() {
    super('Account deletion requires a signed-in account, not a guest session.')
  }
}

export class FreshAuthRequiredError extends BadRequestException {
  constructor() {
    // Carries the same machine code the better-auth step-up uses (ADR-0106 D2), so the web client can
    // tell this apart from a generic 400 and offer password re-entry + retry (ADR-0107 L1 review).
    super({
      statusCode: 400,
      error: 'Bad Request',
      code: 'FRESH_AUTH_REQUIRED',
      message: 'Your session is not fresh enough for this action — re-enter your password.',
    })
  }
}

export class FreshAuthFailedError extends UnauthorizedException {
  constructor() {
    super('Password re-verification failed.')
  }
}

@Injectable()
export class FreshAuthChecker {
  constructor(
    @Inject(STEP_UP_GRANT_REPOSITORY) private readonly stepUpGrants: StepUpGrantRepository,
  ) {}

  /**
   * The step-up for a GET that returns bulk PII (the DSGVO export, ADR-0107 L1): a stolen session that is
   * still within its absolute cap must not exfiltrate everything without re-auth. A GET carries no password
   * body, so the proof is a fresh session or a step-up grant. Fails closed: without a session of
   * `expectedUserId` nothing passes (a guest, who has no account to export, is answered before this is asked).
   */
  async assertFreshSessionOrStepUp(betterAuth: BetterAuthBundle, headers: IncomingHttpHeaders, expectedUserId: string): Promise<void> {
    try {
      await this.decide(betterAuth, fromNodeHeaders(headers), expectedUserId)
    } catch (error) {
      if (!(error instanceof StepUpRefusedError)) throw error
      if (error.reason === 'stale') throw new FreshAuthRequiredError()
      throw new UnauthorizedException('Dafür musst du angemeldet sein.')
    }
  }

  /** The step-up for the account deletion: as above, or the password in the body of this one request. */
  async assertFreshAuth(betterAuth: BetterAuthBundle, headers: IncomingHttpHeaders, expectedUserId: string, password: string | undefined): Promise<void> {
    const fetchHeaders = fromNodeHeaders(headers)
    try {
      await this.decide(betterAuth, fetchHeaders, expectedUserId)
      return
    } catch (error) {
      if (!(error instanceof StepUpRefusedError)) throw error
      if (error.reason !== 'stale') throw new GuestSessionCannotDeleteAccountError()
    }
    // Stale, and the session is the caller's: the password sent along is the proof.
    if (!password) throw new FreshAuthRequiredError()
    try {
      await betterAuth.auth.api.verifyPassword({ headers: fetchHeaders, body: { password } })
    } catch (error) {
      if (error instanceof APIError) throw new FreshAuthFailedError()
      throw error
    }
  }

  private async decide(betterAuth: BetterAuthBundle, headers: Headers, expectedUserId: string): Promise<void> {
    const found = await betterAuth.auth.api.getSession({ headers })
    await assertStepUp({
      session: found ? { id: found.session.id, userId: found.user.id, createdAt: found.session.createdAt } : null,
      expectedUserId,
      hasGrant: (sessionId) => this.stepUpGrants.hasValidGrant(sessionId),
    })
  }
}
