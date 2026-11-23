import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { ResettableRateLimitStorage } from './rate-limit-storage.js'

type AuthMiddlewareContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/**
 * Sign-in attempts per account, from any address (ADR-0106 D9).
 *
 * better-auth limits per client address only (3 per 10 s), so a slow guesser, or one spread over many
 * addresses, could try a password about 26,000 times a day per address. Every attempt on an account counts
 * here, whatever its outcome and wherever it comes from. The trade-off: someone guessing can hold the owner
 * out of password sign-in for the window, never out of a passkey or a social sign-in.
 */
export const ACCOUNT_SIGN_IN_LIMIT = { window: 15 * 60, max: 10 } as const
export const SIGN_IN_EMAIL_PATH = '/sign-in/email'
export const SIGN_IN_ATTEMPTS_EXCEEDED = 'SIGN_IN_ATTEMPTS_EXCEEDED'

export async function enforceAccountSignInLimit(storage: ResettableRateLimitStorage, path: string, body: unknown): Promise<void> {
  if (path !== SIGN_IN_EMAIL_PATH) return
  const email = body && typeof body === 'object' ? (body as { email?: unknown }).email : undefined
  if (typeof email !== 'string' || email.length === 0) return
  const decision = await storage.consume(`sign-in-account:${email.trim().toLowerCase()}`, ACCOUNT_SIGN_IN_LIMIT)
  if (!decision.allowed) {
    throw new APIError('TOO_MANY_REQUESTS', {
      code: SIGN_IN_ATTEMPTS_EXCEEDED,
      message: 'Zu viele Anmeldeversuche für dieses Konto. Bitte warte ein paar Minuten.',
    })
  }
}

/**
 * Password-check attempts per account, for a caller that already holds a session (ADR-0108, review of
 * ADR-0106 D9).
 *
 * `/verify-password` and `/change-password` are both password oracles: a holder of a session cookie can
 * re-check the account password (to satisfy step-up, ADR-0106 D2) or offer a guess as the current password,
 * and a right guess on `/change-password` also takes the account over. better-auth caps both only per client
 * address (3/10s), so a guesser spread over many addresses could brute-force either. Every attempt on the
 * session's account counts here, whatever its outcome and whichever of the two paths it used: they share one
 * budget, or closing one would leave the other open. `enforceVerifyPasswordAccountLimit` runs before the
 * password is checked, so a correct guess at the limit is refused too.
 */
export const VERIFY_PASSWORD_ACCOUNT_LIMIT = { window: 15 * 60, max: 10 } as const
export const VERIFY_PASSWORD_PATH = '/verify-password'
export const CHANGE_PASSWORD_PATH = '/change-password'
export const PASSWORD_CHECK_PATHS: ReadonlySet<string> = new Set([VERIFY_PASSWORD_PATH, CHANGE_PASSWORD_PATH])
export const VERIFY_PASSWORD_ATTEMPTS_EXCEEDED = 'VERIFY_PASSWORD_ATTEMPTS_EXCEEDED'

/** Pure counter: consumes one per-account password-check attempt and throws 429 once the window is full. */
export async function consumeVerifyPasswordAccountLimit(storage: ResettableRateLimitStorage, userId: string): Promise<void> {
  const decision = await storage.consume(`verify-password-account:${userId}`, VERIFY_PASSWORD_ACCOUNT_LIMIT)
  if (!decision.allowed) {
    throw new APIError('TOO_MANY_REQUESTS', {
      code: VERIFY_PASSWORD_ATTEMPTS_EXCEEDED,
      message: 'Zu viele Passwort-Bestätigungen für dieses Konto. Bitte warte ein paar Minuten.',
    })
  }
}

/** The hook for the password-check paths: resolves the session's account and applies the per-account limit. */
export async function enforceVerifyPasswordAccountLimit(storage: ResettableRateLimitStorage, ctx: AuthMiddlewareContext): Promise<void> {
  if (!PASSWORD_CHECK_PATHS.has(ctx.path ?? '')) return
  const session = await getSessionFromCtx(ctx)
  if (!session) return
  await consumeVerifyPasswordAccountLimit(storage, session.user.id)
}
