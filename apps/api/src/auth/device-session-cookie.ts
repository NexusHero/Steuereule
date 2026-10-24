// Makes better-auth's device-authorization `/device/token` endpoint set its own
// session cookie — the framework-standard behaviour every other credential
// endpoint (sign-in/sign-up) already has. The upstream plugin (better-auth
// 1.7.12) creates the session and stashes it on `ctx.context.newSession`, but
// returns the raw `access_token` in the JSON body instead of calling
// `setSessionCookie` — a browser must never hold that Bearer token (ADR-0008/0012).
//
// Rather than re-implementing the signed-cookie wire format (the old
// `device/session-cookie.ts`, now deleted), this plugin uses better-auth's own
// `after`-hook extension point — the same mechanism better-auth's bundled
// two-factor plugin uses to inspect `newSession` after `/sign-in/*` — to call
// better-auth's exported `setSessionCookie` with the real endpoint context. No
// upstream patch is needed; the signing stays entirely inside better-auth.
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'

export const deviceSessionCookiePlugin: BetterAuthPlugin = {
  id: 'device-session-cookie',
  hooks: {
    after: [
      {
        // `/device/token` is the only device route that mints a session — and the
        // only one whose handler sets `newSession`. Its own HTTP route is disabled
        // (disabledPaths); this hook still fires for our server-side
        // `auth.api.deviceToken()` call, because `auth.api.*` dispatches through
        // the same hook pipeline as the router.
        matcher: (context) => context.path === '/device/token',
        handler: createAuthMiddleware(async (ctx) => {
          const data = ctx.context.newSession
          if (!data) return
          await setSessionCookie(ctx, data)
        }),
      },
    ],
  },
}
