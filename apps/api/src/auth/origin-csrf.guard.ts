import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

export const CSRF_TRUSTED_ORIGINS = Symbol('CSRF_TRUSTED_ORIGINS')

/** Methods that can change server state — the only ones CSRF applies to. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class CrossSiteRequestForbiddenError extends ForbiddenException {
  constructor() {
    super('Cross-site request blocked: the Origin is not a trusted origin.')
  }
}

/**
 * Origin-based CSRF protection for the app's own `/v1` controllers (ADR-0103, vulnerability 1).
 *
 * The session cookie is `SameSite=None` so the web app works cross-site (ADR-0011), which removes the
 * cookie's own CSRF defence (ADR-0012 §5). better-auth's built-in origin check only guards `/api/auth/*`;
 * the Nest controllers had no equivalent, so a plain cross-site form POST would arrive with the victim's
 * ambient cookie. CORS does not help — it stops a foreign page *reading* the response, not *sending* the
 * request.
 *
 * On every state-changing request this guard requires, when an `Origin` header is present, that it be one
 * of the configured `trustedOrigins` (the same allowlist better-auth uses — see `mergeTrustedOrigins`).
 *
 * - **Bearer-authenticated requests are exempt** (the MCP/OAuth path, ADR-0052): a bearer token carries no
 *   ambient cookie, so it cannot be driven by a cross-site page and is not subject to CSRF.
 * - **A request with no `Origin` header is allowed.** A browser attaches `Origin` to every cross-site
 *   state-changing request (fetch/XHR and modern form POSTs alike), so its absence means a non-browser
 *   client — a native app (whose session token is read from SecureStore, ADR-0012 §3) or server-to-server —
 *   which is not reachable by browser CSRF. This matches better-auth's own origin check.
 *
 * `Sec-Fetch-Site` is deliberately *not* used as the decision signal: the deployment is genuinely
 * cross-site (web app and API on distinct sites, ADR-0011), so a legitimate web-app call and an attacker's
 * call are *both* `Sec-Fetch-Site: cross-site`. Only the Origin value distinguishes them.
 */
@Injectable()
export class OriginCsrfGuard implements CanActivate {
  private readonly trustedOrigins: ReadonlySet<string>

  constructor(@Inject(CSRF_TRUSTED_ORIGINS) trustedOrigins: readonly string[]) {
    this.trustedOrigins = new Set(trustedOrigins)
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>()

    const method = request.method?.toUpperCase() ?? 'GET'
    if (!STATE_CHANGING_METHODS.has(method)) return true

    const authHeader = request.headers?.authorization
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return true

    const origin = request.headers?.origin
    if (typeof origin !== 'string' || origin.length === 0) return true

    if (this.trustedOrigins.has(origin)) return true

    throw new CrossSiteRequestForbiddenError()
  }
}
