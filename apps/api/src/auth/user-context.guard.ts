import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth.tokens.js'
import { newGuestUserId, resolveGuestSessionSecret, signGuestSession, verifyGuestSession } from './guest-session.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const GUEST_SESSION_COOKIE = 'se_guest_session'
export const USER_ID_REQUEST_KEY = 'userId'
export const USER_ID_KIND_REQUEST_KEY = 'userIdKind'
export const AUTH_CONTEXT_REQUEST_KEY = 'authContext'

export interface AssistantAuthContext {
  readonly source: 'assistent'
  readonly clientId: string
  readonly clientName: string
  readonly scopes: readonly string[]
}

export interface UserAuthContext {
  readonly source: 'nutzer'
}

export type AuthContext = AssistantAuthContext | UserAuthContext

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export type UserIdKind = 'session' | 'guest' | 'bearer'

export type RequestWithUserId = FastifyRequest & {
  [USER_ID_REQUEST_KEY]?: string
  [USER_ID_KIND_REQUEST_KEY]?: UserIdKind
  [AUTH_CONTEXT_REQUEST_KEY]?: AuthContext
}

/** The ONLY place userId is established for a request. */
@Injectable()
export class UserContextGuard implements CanActivate {
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const reply = context.switchToHttp().getResponse<FastifyReply>()

    const authHeader = request.headers?.authorization
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim()
      if (!rawToken) {
        throw new UnauthorizedException('Missing bearer token.')
      }
      if (!this.prisma) {
        throw new UnauthorizedException('Database unavailable for bearer token verification.')
      }
      const tokenHash = createHash('sha256').update(rawToken).digest('base64url')
      const tokenRecord = await this.prisma.oauthAccessToken.findUnique({
        where: { token: tokenHash },
        include: { client: true },
      })
      if (!tokenRecord || !tokenRecord.userId) {
        throw new UnauthorizedException('Invalid bearer token.')
      }
      if (tokenRecord.revoked !== null) {
        throw new UnauthorizedException('Bearer token has been revoked.')
      }
      if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedException('Bearer token has expired.')
      }
      if (tokenRecord.client?.disabled) {
        throw new UnauthorizedException('OAuth client has been disabled.')
      }
      request[USER_ID_REQUEST_KEY] = tokenRecord.userId
      request[USER_ID_KIND_REQUEST_KEY] = 'bearer'
      request[AUTH_CONTEXT_REQUEST_KEY] = {
        source: 'assistent',
        clientId: tokenRecord.clientId,
        clientName: tokenRecord.client?.name ?? 'Assistent',
        scopes: tokenRecord.scopes,
      }
      return true
    }

    const cookies = request.cookies as Record<string, string | undefined> | undefined

    if (cookies?.[this.betterAuth.sessionCookieName]) {
      const session = await this.betterAuth.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })
      if (session) {
        request[USER_ID_REQUEST_KEY] = session.user.id
        request[USER_ID_KIND_REQUEST_KEY] = 'session'
        request[AUTH_CONTEXT_REQUEST_KEY] = { source: 'nutzer' }
        return true
      }
    }

    const secret = resolveGuestSessionSecret()
    const token = cookies?.[GUEST_SESSION_COOKIE]
    const verifiedUserId = token ? verifyGuestSession(token, secret) : undefined
    const userId = verifiedUserId ?? newGuestUserId()

    if (!verifiedUserId) {
      reply.setCookie(GUEST_SESSION_COOKIE, signGuestSession(userId, secret), {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      })
    }

    request[USER_ID_REQUEST_KEY] = userId
    request[USER_ID_KIND_REQUEST_KEY] = 'guest'
    request[AUTH_CONTEXT_REQUEST_KEY] = { source: 'nutzer' }
    return true
  }
}
