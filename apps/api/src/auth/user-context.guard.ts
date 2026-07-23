// The ONLY place userId is established for a request (ADR-0007 gate). Controllers
// and services never read userId from the body/query/path/a client-trusted header —
// they only ever see the value this guard attached, via @CurrentUser(). This is the
// seam a future Keycloak-JWT-verifying guard replaces without touching anything
// downstream.
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { newGuestUserId, resolveGuestSessionSecret, signGuestSession, verifyGuestSession } from './guest-session.js'

export const GUEST_SESSION_COOKIE = 'se_guest_session'
export const USER_ID_REQUEST_KEY = 'userId'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180 // 180 days

export type RequestWithUserId = FastifyRequest & { [USER_ID_REQUEST_KEY]?: string }

@Injectable()
export class UserContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const reply = context.switchToHttp().getResponse<FastifyReply>()
    const secret = resolveGuestSessionSecret()

    const cookies = request.cookies as Record<string, string | undefined> | undefined
    const token = cookies?.[GUEST_SESSION_COOKIE]
    const verifiedUserId = token ? verifyGuestSession(token, secret) : undefined
    const userId = verifiedUserId ?? newGuestUserId()

    if (!verifiedUserId) {
      reply.setCookie(GUEST_SESSION_COOKIE, signGuestSession(userId, secret), {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      })
    }

    request[USER_ID_REQUEST_KEY] = userId
    return true
  }
}
