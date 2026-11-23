import { describe, expect, it } from 'vitest'
import { SESSION_ABSOLUTE_MAX_AGE_MS, isSessionWithinAbsoluteCap } from '../src/auth/session-lifetime.js'

// ADR-0103 vulnerability 2 — an absolute cap on session age. better-auth slides expiresAt forward on use
// with no ceiling, so an actively-used (or stolen, actively-used) session renews forever. The cap is
// measured from session.createdAt; UserContextGuard enforces it.
describe('isSessionWithinAbsoluteCap', () => {
  const now = Date.now()

  it('accepts a session created within the cap', () => {
    const createdAt = new Date(now - (SESSION_ABSOLUTE_MAX_AGE_MS - 60_000))
    expect(isSessionWithinAbsoluteCap(createdAt, now)).toBe(true)
  })

  it('refuses a session older than the cap, however recently it was last used', () => {
    const createdAt = new Date(now - (SESSION_ABSOLUTE_MAX_AGE_MS + 60_000))
    expect(isSessionWithinAbsoluteCap(createdAt, now)).toBe(false)
  })

  it('accepts a Date, an ISO string and an epoch-ms number alike', () => {
    const old = now - (SESSION_ABSOLUTE_MAX_AGE_MS + 60_000)
    expect(isSessionWithinAbsoluteCap(new Date(old), now)).toBe(false)
    expect(isSessionWithinAbsoluteCap(new Date(old).toISOString(), now)).toBe(false)
    expect(isSessionWithinAbsoluteCap(old, now)).toBe(false)
  })

  it('accepts when createdAt is missing or unparseable — the cap is a ceiling, never a reason to reject an undateable session', () => {
    expect(isSessionWithinAbsoluteCap(undefined, now)).toBe(true)
    expect(isSessionWithinAbsoluteCap(null, now)).toBe(true)
    expect(isSessionWithinAbsoluteCap('not-a-date', now)).toBe(true)
  })
})
