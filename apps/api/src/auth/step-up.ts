import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'

import { assertStepUp, isFreshSession, needsStepUp, StepUpRefusedError, STEP_UP_WINDOW_MS } from './step-up-policy.js'

/**
 * Step-up authentication for the better-auth endpoints the step-up rule names (`step-up-policy.ts`, ADR-0106
 * D2/D5, beta review P6).
 *
 * `session.freshAge` stays 0 because the device list depends on it (ADR-0027), so better-auth's own
 * fresh-session check never fires. These paths need either a session younger than {@link STEP_UP_WINDOW_MS}
 * (a fresh sign-in) or a password re-entered on `/verify-password` within that window, recorded for this one
 * session.
 */
export { isFreshSession, STEP_UP_WINDOW_MS }

export const VERIFY_PASSWORD_PATH = '/verify-password'
export const STEP_UP_REQUIRED_CODE = 'FRESH_AUTH_REQUIRED'

export function stepUpIdentifier(sessionId: string): string {
  return `step-up:${sessionId}`
}

export const stepUpPlugin: BetterAuthPlugin = {
  id: 'step-up',
  hooks: {
    before: [
      {
        matcher: (context) => needsStepUp(context.path),
        handler: createAuthMiddleware(async (ctx) => {
          // Declining an assistant takes nothing away from the account: only approving it needs the step-up.
          if (ctx.path === '/oauth2/consent' && (ctx.body as { accept?: unknown } | undefined)?.accept !== true) return
          const found = await getSessionFromCtx(ctx)
          try {
            await assertStepUp({
              session: found ? { id: found.session.id, userId: found.user.id, createdAt: found.session.createdAt } : null,
              hasGrant: async (sessionId) => {
                const record = await ctx.context.internalAdapter.findVerificationValue(stepUpIdentifier(sessionId))
                return record !== null && record !== undefined && new Date(record.expiresAt).getTime() > Date.now()
              },
            })
          } catch (error) {
            if (!(error instanceof StepUpRefusedError)) throw error
            // Every endpoint under the rule needs a session; refusing here does not rely on each of them saying so.
            if (error.reason !== 'stale') throw new APIError('UNAUTHORIZED', { message: 'Dafür musst du angemeldet sein.' })
            throw new APIError('FORBIDDEN', {
              code: STEP_UP_REQUIRED_CODE,
              message: 'Bitte bestätige, dass du es bist, bevor du das änderst.',
            })
          }
        }),
      },
    ],
    after: [
      {
        matcher: (context) => context.path === VERIFY_PASSWORD_PATH,
        handler: createAuthMiddleware(async (ctx) => {
          if (ctx.context.returned instanceof APIError) return
          const session = ctx.context.session ?? (await getSessionFromCtx(ctx))
          if (!session) return
          const identifier = stepUpIdentifier(session.session.id)
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier)
          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: session.user.id,
            expiresAt: new Date(Date.now() + STEP_UP_WINDOW_MS),
          })
        }),
      },
    ],
  },
}

/**
 * A password change ends every assistant connection of the account (ADR-0106 D5): its refresh tokens can
 * no longer mint access tokens, and deleting the consent stops the access tokens already issued, because
 * every bearer request re-checks it (ADR-0052 §10). The user links an assistant again afterwards.
 */
export const OAUTH_GRANT_MODELS = ['oauthRefreshToken', 'oauthAccessToken', 'oauthConsent'] as const

export const revokeOauthGrantsOnPasswordChangePlugin: BetterAuthPlugin = {
  id: 'revoke-oauth-grants-on-password-change',
  hooks: {
    after: [
      {
        matcher: (context) => context.path === '/change-password',
        handler: createAuthMiddleware(async (ctx) => {
          if (ctx.context.returned instanceof APIError) return
          const userId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id
          if (!userId) return
          for (const model of OAUTH_GRANT_MODELS) {
            await ctx.context.adapter.deleteMany({ model, where: [{ field: 'userId', value: userId }] })
          }
        }),
      },
    ],
  },
}
