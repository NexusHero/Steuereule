/**
 * Session lifetime policy (ADR-0103, vulnerability 2).
 *
 * better-auth slides a session's `expiresAt` forward on use (`updateAge`) and has no concept of an
 * absolute maximum age from creation, so an actively-used session renews indefinitely — a stolen cookie
 * stays valid forever under active use. We keep the sliding *idle* window but add a hard cap measured from
 * `session.createdAt`, enforced in `UserContextGuard` (better-auth's config cannot express it).
 */

/**
 * The sliding idle window (better-auth `session.expiresIn`): a session dies this long after it was last
 * used. Kept at better-auth's own default — this is the inactivity timeout, not the gap this ADR closes —
 * but pinned explicitly so the value is a reviewed decision rather than an inherited library default.
 */
export const SESSION_IDLE_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days

/**
 * How often the idle window is slid forward on use (better-auth `session.updateAge`): at most once per day,
 * so the hot authenticated path is not writing the session row on every request. Equals better-auth's
 * default, pinned for the same reason as above.
 */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 // 1 day

/**
 * The absolute maximum age of a session from the moment it was created, independent of the sliding window.
 * Once a session is older than this it is refused however recently it was used, forcing re-authentication.
 *
 * 30 days balances a consumer tax app's "stay signed in" expectation against bounding the lifetime of a
 * stolen `SameSite=None` cookie (ADR-0011): well beyond the 7-day idle window so an ordinary active user is
 * never surprised mid-session, yet a hard ceiling rather than the unbounded renewal better-auth allows.
 */
export const SESSION_ABSOLUTE_MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000 // 30 days

/**
 * Whether a session created at `createdAt` is still within the absolute cap. An absent or unparseable
 * `createdAt` returns `true` (accept): the cap is an additional ceiling, never a reason to reject a session
 * we cannot date — a real better-auth session always carries `createdAt`.
 */
export function isSessionWithinAbsoluteCap(createdAt: Date | string | number | null | undefined, now: number = Date.now()): boolean {
  if (createdAt === null || createdAt === undefined) return true
  const createdMs = toEpochMs(createdAt)
  if (!Number.isFinite(createdMs)) return true
  return now - createdMs < SESSION_ABSOLUTE_MAX_AGE_MS
}

function toEpochMs(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/**
 * The absolute-cap ceiling for a session's `expiresAt`, used where better-auth itself slides the session
 * (`databaseHooks.session.update.before`). Returns the clamped `expiresAt` (never later than
 * `createdAt + SESSION_ABSOLUTE_MAX_AGE_MS`) when the proposed value would exceed the cap, otherwise
 * `undefined` (leave it as proposed). Once a session is past the cap this returns a time in the past, so
 * better-auth's own `expiresAt < now` check expires and deletes the session on its next read — which is why
 * this, not the guard check alone, is what forces a stolen, actively-used cookie to die on every route.
 */
export function clampExpiresAtToAbsoluteCap(
  createdAt: Date | string | number | null | undefined,
  proposedExpiresAt: Date | string | number | null | undefined,
): Date | undefined {
  if (createdAt === null || createdAt === undefined || proposedExpiresAt === null || proposedExpiresAt === undefined) return undefined
  const createdMs = toEpochMs(createdAt)
  const proposedMs = toEpochMs(proposedExpiresAt)
  if (!Number.isFinite(createdMs) || !Number.isFinite(proposedMs)) return undefined
  const capMs = createdMs + SESSION_ABSOLUTE_MAX_AGE_MS
  if (proposedMs <= capMs) return undefined
  return new Date(capMs)
}
