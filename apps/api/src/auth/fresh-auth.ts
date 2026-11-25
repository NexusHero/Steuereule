import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import { APIError } from 'better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import type { BetterAuthBundle } from './auth.tokens.js'
import { STEP_UP_GRANT_REPOSITORY, type StepUpGrantRepository } from './step-up-grant.repository.js'
import { isFreshSession, STEP_UP_WINDOW_MS } from './step-up-policy.js'

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
   * Fresh-auth gate for a GET that returns bulk PII (the DSGVO export, ADR-0107 L1): a stolen session
   * that is still within its absolute cap must not exfiltrate everything without re-auth, matching the
   * deletion path. Since a GET carries no password body, this accepts either a fresh session or an
   * existing step-up grant (recorded by /verify-password within the window, ADR-0106 D2). A guest with
   * no better-auth account is left alone — the export itself answers 404 for it.
   */
  async assertFreshSessionOrStepUp(
    betterAuth: BetterAuthBundle,
    headers: IncomingHttpHeaders,
    expectedUserId: string,
  ): Promise<void> {
    const session = await betterAuth.auth.api.getSession({ headers: fromNodeHeaders(headers) })
    if (!session || session.user.id !== expectedUserId) return

    if (isFreshSession(session.session.createdAt)) return

    if (await this.stepUpGrants.hasValidGrant(session.session.id)) return

    throw new FreshAuthRequiredError()
  }

  async assertFreshAuth(
    betterAuth: BetterAuthBundle,
    headers: IncomingHttpHeaders,
    expectedUserId: string,
    password: string | undefined,
  ): Promise<void> {
    const fetchHeaders = fromNodeHeaders(headers)
    const session = await betterAuth.auth.api.getSession({ headers: fetchHeaders })

    if (!session) throw new GuestSessionCannotDeleteAccountError()

    if (session.user.id !== expectedUserId) throw new GuestSessionCannotDeleteAccountError()

    if (isFreshSession(session.session.createdAt)) return
    // A step-up grant counts too: an account without a password has no password to send (WEB-50).
    if (await this.stepUpGrants.hasValidGrant(session.session.id)) return

    if (!password) throw new FreshAuthRequiredError()

    try {
      await betterAuth.auth.api.verifyPassword({ headers: fetchHeaders, body: { password } })
    } catch (error) {
      if (error instanceof APIError) throw new FreshAuthFailedError()
      throw error
    }
  }
}
