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
        // SameSite=None; Secure (ADR-0011, amending ADR-0007's original `strict`): the web
        // app and the API run on different origins in both local dev (different ports on
        // localhost) and the deployed demo (distinct *.fly.dev subdomains). Local dev is
        // cross-origin but same-site — `SameSite` keys on scheme + registrable domain, and
        // port isn't part of "site", so `strict` would survive there unaffected. What
        // genuinely forces `None` is the deployed demo, where the web app and API sit on
        // different registrable domains (`fly.dev` is a public suffix, so each subdomain is
        // its own site) — a real cross-site credentialed request, from which the browser
        // silently drops a `strict`/`Lax` cookie, leaving the onboarding vertical broken even
        // with CORS headers correct. `None` is required for that deployed cross-site case and
        // harmlessly permissive for the same-site local one. `Secure` is required whenever
        // `SameSite=None` is set (browsers reject the pairing otherwise); this is safe
        // unconditionally because `http://localhost` is treated as a secure context by modern
        // browsers even without TLS, and the deployed demo is HTTPS-only (ADR-0007).
        sameSite: 'none',
        secure: true,
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      })
    }

    request[USER_ID_REQUEST_KEY] = userId
    return true
  }
}
