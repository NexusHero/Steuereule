import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import { APIError } from 'better-auth'
import type { IncomingHttpHeaders } from 'node:http'
import type { BetterAuthBundle } from './auth.tokens.js'

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

    const createdAt = new Date(session.session.createdAt).getTime()
    const isFresh = Date.now() - createdAt < ACCOUNT_DELETE_FRESH_WINDOW_MS
    if (isFresh) return

    if (!password) throw new FreshAuthRequiredError()

    try {
      await betterAuth.auth.api.verifyPassword({ headers: fetchHeaders, body: { password } })
    } catch (error) {
      if (error instanceof APIError) throw new FreshAuthFailedError()
      throw error
    }
  }
}
