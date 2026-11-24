import { APIError } from 'better-auth/api'
import type { ResettableRateLimitStorage } from './rate-limit-storage.js'

export const REQUEST_PASSWORD_RESET_PATH = '/request-password-reset'
/** The web app route that takes `?token=…` (or `?error=INVALID_TOKEN`) from better-auth's callback. */
export const PASSWORD_RESET_WEB_ROUTE = '/passwort-zuruecksetzen'
/** A reset link lives half an hour (ADR-0109); better-auth deletes it on use, so it works once. */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 30 * 60
/** Requests per target e-mail address: mail bombing through the form is bounded whoever sends it. */
export const PASSWORD_RESET_EMAIL_LIMIT = { window: 60 * 60, max: 3 } as const
/** Requests per client address; the per-address default of better-auth (3 a minute) is too loose for an hour. */
export const PASSWORD_RESET_ADDRESS_RULE = { window: 10 * 60, max: 5 } as const
/** Guesses at a token per client address. */
export const RESET_PASSWORD_RULE = { window: 60, max: 5 } as const

function isWebAppUrl(raw: string, webAppUrl: string): boolean {
  if (raw.startsWith('//')) return false
  try {
    return new URL(raw, webAppUrl).origin === new URL(webAppUrl).origin
  } catch {
    return false
  }
}

/**
 * Before better-auth runs a reset request: the page it will send the user back to must be the web app's own
 * (not any trusted CORS origin), and one address may be asked for only a few mails an hour. Both answers
 * ignore whether the account exists, so the form still says the same to everyone.
 */
export async function enforcePasswordResetRequest(storage: ResettableRateLimitStorage, path: string, body: unknown, webAppUrl: string): Promise<void> {
  if (path !== REQUEST_PASSWORD_RESET_PATH) return
  const { email, redirectTo } = body && typeof body === 'object' ? (body as { email?: unknown; redirectTo?: unknown }) : {}
  if (typeof redirectTo === 'string' && !isWebAppUrl(redirectTo, webAppUrl)) {
    throw new APIError('BAD_REQUEST', { code: 'INVALID_REDIRECT_TO', message: 'Die Weiterleitung ist nicht erlaubt.' })
  }
  if (typeof email !== 'string' || email.length === 0) return
  const decision = await storage.consume(`password-reset-email:${email.trim().toLowerCase()}`, PASSWORD_RESET_EMAIL_LIMIT)
  if (!decision.allowed) {
    throw new APIError('TOO_MANY_REQUESTS', { code: 'PASSWORD_RESET_LIMIT', message: 'Zu viele Anfragen für diese E-Mail-Adresse. Bitte versuch es später noch mal.' })
  }
}

/**
 * The link in the mail is better-auth's own callback (it checks the token, then redirects with `?token=`).
 * Its `callbackURL` is forced onto the web app, the reset page when it names anything else (ADR-0104 L2).
 */
export function restrictResetLinkToWebApp(resetUrl: string, webAppUrl: string): string {
  const url = new URL(resetUrl)
  const raw = url.searchParams.get('callbackURL') ?? ''
  const fallback = `${new URL(webAppUrl).origin}${PASSWORD_RESET_WEB_ROUTE}`
  url.searchParams.set('callbackURL', raw !== '' && isWebAppUrl(raw, webAppUrl) ? new URL(raw, webAppUrl).toString() : fallback)
  return url.toString()
}
