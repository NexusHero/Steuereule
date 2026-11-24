import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'

/**
 * Step-up authentication for the actions that let a stolen session outlive the password (ADR-0106 D2/D5).
 *
 * `session.freshAge` stays 0 because the device list depends on it (ADR-0027), so better-auth's own
 * fresh-session check never fires. Without one, a stolen cookie could register its own passkey, approve an
 * assistant (OAuth consent with a refresh token) or link its own social login, and each of these kept
 * working after the victim changed the password and every session was revoked.
 *
 * These paths now need either a session younger than {@link STEP_UP_WINDOW_MS} (a fresh sign-in) or a
 * password re-entered on `/verify-password` within that window, recorded for this one session.
 */
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000

export const STEP_UP_PATHS: ReadonlySet<string> = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/oauth2/consent',
  // A pre-existing consent must not be widened (e.g. adding offline_access), nor an authorize flow
  // resumed, from a stale stolen session either (pentest 2026-11-23, ADR-0107 L2): the oauth-provider
  // plugin exposes these alongside /oauth2/consent, and D2 only gated the fresh-grant path.
  '/oauth2/update-consent',
  '/oauth2/continue',
  '/link-social',
])

export const VERIFY_PASSWORD_PATH = '/verify-password'
export const STEP_UP_REQUIRED_CODE = 'FRESH_AUTH_REQUIRED'

export function stepUpIdentifier(sessionId: string): string {
  return `step-up:${sessionId}`
}

export function isFreshSession(createdAt: Date | string | number, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < STEP_UP_WINDOW_MS
}

export const stepUpPlugin: BetterAuthPlugin = {
  id: 'step-up',
  hooks: {
    before: [
      {
        matcher: (context) => STEP_UP_PATHS.has(context.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          // Declining an assistant takes nothing away from the account: only approving it needs the step-up.
          if (ctx.path === '/oauth2/consent' && (ctx.body as { accept?: unknown } | undefined)?.accept !== true) return
          const session = await getSessionFromCtx(ctx)
          // Without a session the endpoint answers 401 itself.
          if (!session) return
          if (isFreshSession(session.session.createdAt)) return
          const record = await ctx.context.internalAdapter.findVerificationValue(stepUpIdentifier(session.session.id))
          if (record && new Date(record.expiresAt).getTime() > Date.now()) return
          throw new APIError('FORBIDDEN', {
            code: STEP_UP_REQUIRED_CODE,
            message: 'Bitte bestätige dein Passwort, bevor du das änderst.',
          })
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
