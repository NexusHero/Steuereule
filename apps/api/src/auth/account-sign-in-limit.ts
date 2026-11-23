import { APIError } from 'better-auth/api'
import type { ResettableRateLimitStorage } from './rate-limit-storage.js'

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
