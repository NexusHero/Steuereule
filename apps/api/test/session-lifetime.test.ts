import { describe, expect, it } from 'vitest'
import { SESSION_ABSOLUTE_MAX_AGE_MS, clampExpiresAtToAbsoluteCap, isSessionWithinAbsoluteCap } from '../src/auth/session-lifetime.js'

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

// The better-auth-boundary half of the cap: clamp every expiry slide to createdAt + cap, so better-auth's
// own `expiresAt < now` check expires a past-the-cap session on every route (not only `/v1`).
describe('clampExpiresAtToAbsoluteCap', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  const capMs = createdAt.getTime() + SESSION_ABSOLUTE_MAX_AGE_MS

  it('clamps a slide that would push expiry past the cap', () => {
    const proposed = new Date(capMs + 7 * 24 * 60 * 60 * 1000) // createdAt + 37 days
    expect(clampExpiresAtToAbsoluteCap(createdAt, proposed)).toEqual(new Date(capMs))
  })

  it('leaves a slide that stays within the cap untouched', () => {
    const proposed = new Date(createdAt.getTime() + 5 * 24 * 60 * 60 * 1000) // createdAt + 5 days
    expect(clampExpiresAtToAbsoluteCap(createdAt, proposed)).toBeUndefined()
  })

  it('once past the cap, clamps to a time in the past so better-auth expires the session on next read', () => {
    // A session created 31 days ago whose slide proposes now+7d: the clamp is createdAt + 30d, in the past.
    const created = new Date(Date.now() - (SESSION_ABSOLUTE_MAX_AGE_MS + 24 * 60 * 60 * 1000))
    const proposed = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const clamped = clampExpiresAtToAbsoluteCap(created, proposed)
    expect(clamped).toBeInstanceOf(Date)
    expect(clamped!.getTime()).toBeLessThan(Date.now())
  })

  it('leaves the slide alone when createdAt or the proposed value is missing/unparseable', () => {
    const proposed = new Date(capMs + 1000)
    expect(clampExpiresAtToAbsoluteCap(undefined, proposed)).toBeUndefined()
    expect(clampExpiresAtToAbsoluteCap(createdAt, undefined)).toBeUndefined()
    expect(clampExpiresAtToAbsoluteCap('not-a-date', proposed)).toBeUndefined()
  })
})
