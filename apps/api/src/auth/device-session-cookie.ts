import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'

export const deviceSessionCookiePlugin: BetterAuthPlugin = {
  id: 'device-session-cookie',
  hooks: {
    after: [
      {
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
