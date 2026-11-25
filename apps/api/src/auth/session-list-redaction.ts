import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'

/**
 * `/list-sessions` hands no session token to JavaScript (WEB-22). better-auth returns every session row of the
 * account, token included; the device list needs only which device, when and which one is this one. The token
 * is dropped from the answer, and the device list names a session by its id instead: `/revoke-session` accepts
 * the id of one of the caller's own sessions in `token` and swaps in the real token before better-auth reads it.
 * A real token (another client) passes through unchanged.
 */
export function redactSessionList(returned: readonly unknown[]): unknown[] {
  return returned.map((session: unknown) => {
    if (!session || typeof session !== 'object') return session
    const { token: _token, ...rest } = session as Record<string, unknown>
    return rest
  })
}

interface SessionLookupAdapter {
  findOne<T>(input: { model: string; where: { field: string; value: string }[] }): Promise<T | null>
}

export const sessionListRedactionPlugin: BetterAuthPlugin = {
  id: 'session-list-redaction',
  hooks: {
    before: [
      {
        matcher: (context) => context.path === '/revoke-session',
        handler: createAuthMiddleware(async (ctx) => {
          const body = ctx.body as { token?: unknown } | undefined
          if (typeof body?.token !== 'string') return
          const session = await getSessionFromCtx(ctx)
          if (!session) return
          const adapter = ctx.context.adapter as unknown as SessionLookupAdapter
          const own = await adapter.findOne<{ token: string; userId: string }>({
            model: 'session',
            where: [
              { field: 'id', value: body.token },
              { field: 'userId', value: session.user.id },
            ],
          })
          if (!own) return
          return { context: { body: { ...body, token: own.token } } }
        }),
      },
    ],
    after: [
      {
        matcher: (context) => context.path === '/list-sessions',
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned
          if (!Array.isArray(returned)) return
          return ctx.json(redactSessionList(returned) as Record<string, unknown>[])
        }),
      },
    ],
  },
}
