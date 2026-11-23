import { describe, expect, it } from 'vitest'
import type { GenericEndpointContext } from 'better-auth'
import { capSessionUpdateExpiry } from '../src/auth/session-absolute-cap.js'
import { SESSION_ABSOLUTE_MAX_AGE_MS } from '../src/auth/session-lifetime.js'

// ADR-0103 vulnerability 2, better-auth boundary — the `databaseHooks.session.update.before` matcher. The
// mounted better-auth handler bypasses UserContextGuard, so the cap must be enforced where better-auth
// itself slides the session. This reads the caller's own session off the endpoint context.
function contextWithCreatedAt(createdAt: Date | undefined): GenericEndpointContext {
  return { context: { session: createdAt ? { session: { createdAt } } : null } } as unknown as GenericEndpointContext
}

describe('capSessionUpdateExpiry', () => {
  const createdAt = new Date(Date.now() - (SESSION_ABSOLUTE_MAX_AGE_MS + 24 * 60 * 60 * 1000)) // 31 days ago
  const proposed = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // a normal +7d slide

  it('clamps the slide of an over-cap session to a past time (so better-auth expires it on next read)', () => {
    const result = capSessionUpdateExpiry({ expiresAt: proposed, updatedAt: new Date() }, contextWithCreatedAt(createdAt))
    expect(result).toBeDefined()
    expect(result!.data.expiresAt.getTime()).toBe(createdAt.getTime() + SESSION_ABSOLUTE_MAX_AGE_MS)
    expect(result!.data.expiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('leaves a within-cap session slide alone', () => {
    const youngCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    expect(capSessionUpdateExpiry({ expiresAt: proposed }, contextWithCreatedAt(youngCreatedAt))).toBeUndefined()
  })

  it('does nothing for a non-expiry update, a missing body, or a context with no resolved session', () => {
    expect(capSessionUpdateExpiry({ updatedAt: new Date() }, contextWithCreatedAt(createdAt))).toBeUndefined()
    expect(capSessionUpdateExpiry(undefined, contextWithCreatedAt(createdAt))).toBeUndefined()
    expect(capSessionUpdateExpiry({ expiresAt: proposed }, contextWithCreatedAt(undefined))).toBeUndefined()
    expect(capSessionUpdateExpiry({ expiresAt: proposed }, null)).toBeUndefined()
  })
})
