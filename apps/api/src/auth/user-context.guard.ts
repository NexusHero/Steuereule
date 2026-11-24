import { createHash } from 'node:crypto'
import { ForbiddenException, Inject, Injectable, Optional, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ACCEPTS_ASSISTANT_TOKEN } from './accepts-assistant-token.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth.tokens.js'
import { newGuestUserId, resolveGuestSessionSecret, signGuestSession, verifyGuestSession } from './guest-session.js'
import { BEARER_TOKEN_REPOSITORY, type BearerTokenRepository } from './bearer-token.repository.js'
import { verifyJwsAccessToken } from 'better-auth/oauth2'
import { authIssuer, mcpResourceUrls } from './mcp-oauth.js'
import { isSessionWithinAbsoluteCap } from './session-lifetime.js'
import { TooManyRequestsError, UnauthenticatedError } from '../common/domain-error.js'
import { GUEST_ACTIVITY_RECORDER, type GuestActivityRecorder } from '../guest/guest-retention.js'

type JwksFetch = Extract<Parameters<typeof verifyJwsAccessToken>[1]['jwksFetch'], () => unknown>

export const GUEST_SESSION_COOKIE = 'se_guest_session'
export const USER_ID_REQUEST_KEY = 'userId'
export const USER_ID_KIND_REQUEST_KEY = 'userIdKind'
export const AUTH_CONTEXT_REQUEST_KEY = 'authContext'
/** Whether the established identity's email is verified — read by `RequiresVerifiedEmailGuard` (ADR-0103). */
export const EMAIL_VERIFIED_REQUEST_KEY = 'emailVerified'
/** The 401 code of a session cookie that no longer verifies (WEB-24); the client sends the user to sign in. */
export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED'

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

/**
 * Writes by guests per client address (ADR-0106 D8). A guest needs no account, and every guest write may
 * create rows: 150 anonymous requests created 150 profiles. An interview from one household stays far below
 * this; a script filling the database does not.
 */
export const GUEST_WRITE_LIMIT = { window: 60 * 60, max: 300 } as const
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export type UserIdKind = 'session' | 'guest' | 'bearer'

export type RequestWithUserId = FastifyRequest & {
  [USER_ID_REQUEST_KEY]?: string
  [USER_ID_KIND_REQUEST_KEY]?: UserIdKind
  [AUTH_CONTEXT_REQUEST_KEY]?: AuthContext
  [EMAIL_VERIFIED_REQUEST_KEY]?: boolean
}

/** The ONLY place userId is established for a request. */
@Injectable()
export class UserContextGuard implements CanActivate {
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(BEARER_TOKEN_REPOSITORY) private readonly tokens: BearerTokenRepository,
    @Optional() @Inject(GUEST_ACTIVITY_RECORDER) private readonly guestActivity?: GuestActivityRecorder,
  ) {}

  /**
   * A token an MCP client asked for the MCP endpoint (RFC 8707) is a JWT signed by better-auth: checked
   * against its keys, our issuer and the MCP endpoint as audience. A JWT cannot be revoked, so the
   * connection itself is checked too: revoking deletes the consent, and that stops the token at once
   * (ADR-0052 §10). Client-credentials tokens carry no user and are refused.
   */
  private async acceptJwtAccessToken(request: RequestWithUserId, rawToken: string): Promise<boolean> {
    // The bundle is typed with better-auth's base API; the jwt plugin adds getJwks at runtime.
    const auth = this.betterAuth.auth as unknown as { api: { getJwks: JwksFetch }; options: { baseURL?: unknown } }
    const baseUrl = String(auth.options.baseURL)
    let claims: { sub?: unknown; client_id?: unknown; scope?: unknown }
    try {
      claims = await verifyJwsAccessToken(rawToken, {
        jwksFetch: () => auth.api.getJwks(),
        verifyOptions: { issuer: authIssuer(baseUrl), audience: mcpResourceUrls(baseUrl) },
      })
    } catch {
      throw new UnauthorizedException('Invalid bearer token.')
    }
    const userId = typeof claims.sub === 'string' ? claims.sub : null
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
    if (!userId || !clientId || userId === clientId) throw new UnauthorizedException('Invalid bearer token.')
    const [client, consented] = await Promise.all([this.tokens.findClient(clientId), this.tokens.hasConsent(userId, clientId)])
    if (!client || client.disabled) throw new UnauthorizedException('OAuth client has been disabled.')
    if (!consented) throw new UnauthorizedException('Bearer token has been revoked.')
    request[USER_ID_REQUEST_KEY] = userId
    request[USER_ID_KIND_REQUEST_KEY] = 'bearer'
    request[AUTH_CONTEXT_REQUEST_KEY] = {
      source: 'assistent',
      clientId,
      clientName: client.name ?? 'Assistent',
      scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter((scope) => scope.length > 0) : [],
    }
    // An assistant acts for an account that completed OAuth consent; it cannot verify an email itself, so
    // it is not subject to the verified-email gate (ADR-0103).
    request[EMAIL_VERIFIED_REQUEST_KEY] = true
    return true
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUserId>()
    const reply = context.switchToHttp().getResponse<FastifyReply>()

    // The guest sweep rides on any guarded request (ADR-0109); it runs at most once an hour per process.
    this.guestActivity?.seen()

    const authHeader = request.headers?.authorization
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      // An assistant's token is good for the MCP endpoint only (ADR-0052 amendment 4): on any other
      // controller it would pass for the user and walk around the tools' scopes and read view.
      if (Reflect.getMetadata(ACCEPTS_ASSISTANT_TOKEN, context.getClass()) !== true) {
        throw new ForbiddenException('Ein Assistenten-Token gilt nur am MCP-Endpunkt.')
      }
      const rawToken = authHeader.slice(7).trim()
      if (!rawToken) {
        throw new UnauthorizedException('Missing bearer token.')
      }
      if (rawToken.split('.').length === 3) return this.acceptJwtAccessToken(request, rawToken)
      const tokenHash = createHash('sha256').update(rawToken).digest('base64url')
      const tokenRecord = await this.tokens.findOpaqueToken(tokenHash)
      if (!tokenRecord || !tokenRecord.userId) {
        throw new UnauthorizedException('Invalid bearer token.')
      }
      if (tokenRecord.revoked !== null) {
        throw new UnauthorizedException('Bearer token has been revoked.')
      }
      if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedException('Bearer token has expired.')
      }
      if (tokenRecord.client.disabled) {
        throw new UnauthorizedException('OAuth client has been disabled.')
      }
      request[USER_ID_REQUEST_KEY] = tokenRecord.userId
      request[USER_ID_KIND_REQUEST_KEY] = 'bearer'
      request[AUTH_CONTEXT_REQUEST_KEY] = {
        source: 'assistent',
        clientId: tokenRecord.clientId,
        clientName: tokenRecord.client.name ?? 'Assistent',
        scopes: [...tokenRecord.scopes],
      }
      request[EMAIL_VERIFIED_REQUEST_KEY] = true
      return true
    }

    const cookies = request.cookies as Record<string, string | undefined> | undefined

    if (cookies?.[this.betterAuth.sessionCookieName]) {
      const session = await this.betterAuth.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })
      // Past the absolute cap (ADR-0103) a session is refused like an expired one: the guard falls through
      // to the guest path rather than honouring an indefinitely-renewed cookie.
      if (session && isSessionWithinAbsoluteCap(session.session?.createdAt)) {
        request[USER_ID_REQUEST_KEY] = session.user.id
        request[USER_ID_KIND_REQUEST_KEY] = 'session'
        request[AUTH_CONTEXT_REQUEST_KEY] = { source: 'nutzer' }
        request[EMAIL_VERIFIED_REQUEST_KEY] = session.user.emailVerified === true
        return true
      }
      // WEB-24: a session that expired, was revoked or is past the absolute cap (ADR-0103) is refused with a
      // 401 the client can act on, instead of letting a signed-in user's next save land in a fresh guest
      // account. The stale cookie is cleared, so the request after this one is an ordinary guest request.
      void reply.clearCookie(this.betterAuth.sessionCookieName, { path: '/' })
      throw new UnauthenticatedError(SESSION_EXPIRED_CODE, 'Die Anmeldung ist abgelaufen. Bitte melde dich neu an.')
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

    if (STATE_CHANGING_METHODS.has(request.method?.toUpperCase() ?? 'GET')) {
      const decision = await this.betterAuth.rateLimitStorage.consume(`guest-write:${request.ip ?? 'no-ip'}`, GUEST_WRITE_LIMIT)
      if (!decision.allowed) {
        throw new TooManyRequestsError('GUEST_WRITE_LIMIT', 'Zu viele Änderungen ohne Konto. Lege ein Konto an oder versuch es später noch mal.')
      }
      // The retention clock (ADR-0109): 30 days after the last write the guest's data is erased. A failed
      // note must not fail the write; the guest then simply is not swept until the next one succeeds.
      await this.guestActivity?.touch(userId).catch(() => undefined)
    }

    request[USER_ID_REQUEST_KEY] = userId
    request[USER_ID_KIND_REQUEST_KEY] = 'guest'
    request[AUTH_CONTEXT_REQUEST_KEY] = { source: 'nutzer' }
    return true
  }
}
