/**
 * Session-token rotation on password change (ADR-0103, vulnerability 3).
 *
 * better-auth's `/change-password` rotates the current session token *and* revokes the account's other
 * sessions only when the caller passes `revokeOtherSessions: true`; its default does neither, leaving the
 * current token stable and every other session live after a password change (`update-user.mjs`). The web
 * client cannot be relied on to send the flag, so this forces it server-side, in better-auth's own
 * `hooks.before`, by setting the field on the request body before the handler reads it. better-auth then
 * does the full rotate-and-revoke through its own supported path — we add no bespoke session surgery.
 *
 * Returned shape is the context override better-auth's before-hook pipeline merges into the request
 * (`dispatch.mjs` `runBeforeHooks`): `{ context: { body } }`.
 */
export const CHANGE_PASSWORD_PATH = '/change-password'

export function forceRevokeOtherSessionsOnPasswordChange(
  path: string,
  body: unknown,
): { context: { body: Record<string, unknown> } } | undefined {
  if (path !== CHANGE_PASSWORD_PATH) return undefined
  const current = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (current.revokeOtherSessions === true) return undefined
  return { context: { body: { ...current, revokeOtherSessions: true } } }
}
