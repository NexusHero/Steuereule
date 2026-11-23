import type { GenericEndpointContext } from 'better-auth'
import { clampExpiresAtToAbsoluteCap } from './session-lifetime.js'

/**
 * `databaseHooks.session.update.before` matcher that enforces the absolute session cap (ADR-0103
 * vulnerability 2) at the better-auth session boundary — the half `UserContextGuard` cannot reach, because
 * the mounted better-auth handler (`/api/auth/*`) runs outside the Nest guard (`mount-better-auth.ts`).
 *
 * When better-auth slides a session forward (`session.mjs` `getSession`) it calls `updateSession` with a new
 * `expiresAt`; this clamps that write to `createdAt + SESSION_ABSOLUTE_MAX_AGE_MS`. The session being slid is
 * the caller's own, resolved onto the endpoint context just before the slide (`ctx.context.session`), so its
 * `createdAt` is read from there. Once a session is past the cap the clamp is a time in the past, so
 * better-auth's own `expiresAt < now` check expires and deletes it on the next read, on every route — which
 * is what forces a stolen, actively-used cookie to re-authenticate, not merely lose access to `/v1`.
 *
 * Returns `{ data }` with the clamped `expiresAt` to override the write, or `undefined` to leave it
 * unchanged (proposed value within the cap, or no `createdAt`/`expiresAt` to measure — e.g. a session update
 * that is not an expiry slide). It only ever shortens `expiresAt`, never extends it.
 */
export function capSessionUpdateExpiry(
  data: unknown,
  context: GenericEndpointContext | null | undefined,
): { data: { expiresAt: Date } } | undefined {
  if (!data || typeof data !== 'object') return undefined
  const proposedExpiresAt = (data as Record<string, unknown>).expiresAt
  if (!(proposedExpiresAt instanceof Date) && typeof proposedExpiresAt !== 'string' && typeof proposedExpiresAt !== 'number') return undefined

  const createdAt = context?.context?.session?.session?.createdAt
  const clamped = clampExpiresAtToAbsoluteCap(createdAt, proposedExpiresAt)
  if (!clamped) return undefined

  // Only the clamped expiresAt is returned; better-auth merges it over the rest of the update payload.
  return { data: { expiresAt: clamped } }
}
