import { describe, expect, it } from 'vitest'
import {
  newGuestUserId,
  resolveGuestSessionSecret,
  signGuestSession,
  verifyGuestSession,
} from '../src/auth/guest-session.js'

describe('signGuestSession / verifyGuestSession', () => {
  it('round-trips a userId signed and verified under the same secret', () => {
    const userId = newGuestUserId()
    const token = signGuestSession(userId, 'secret-a')
    expect(verifyGuestSession(token, 'secret-a')).toBe(userId)
  })

  it('rejects a token verified under a different secret', () => {
    const token = signGuestSession('user-1', 'secret-a')
    expect(verifyGuestSession(token, 'secret-b')).toBeUndefined()
  })

  it('rejects a token whose userId was tampered with (signature no longer matches)', () => {
    const token = signGuestSession('user-1', 'secret-a')
    const [, signature] = token.split('.')
    const tampered = `user-2.${signature}`
    expect(verifyGuestSession(tampered, 'secret-a')).toBeUndefined()
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signGuestSession('user-1', 'secret-a')
    const tampered = `${token.slice(0, -1)}0`
    expect(verifyGuestSession(tampered, 'secret-a')).toBeUndefined()
  })

  it('rejects a malformed token with no separator', () => {
    expect(verifyGuestSession('not-a-real-token', 'secret-a')).toBeUndefined()
  })

  it('rejects an empty token', () => {
    expect(verifyGuestSession('', 'secret-a')).toBeUndefined()
  })

  it('newGuestUserId returns distinct ids across calls', () => {
    expect(newGuestUserId()).not.toBe(newGuestUserId())
  })
})

describe('resolveGuestSessionSecret', () => {
  it('returns the configured GUEST_SESSION_SECRET when set', () => {
    expect(resolveGuestSessionSecret({ GUEST_SESSION_SECRET: 'configured-secret' })).toBe(
      'configured-secret',
    )
  })

  it('falls back to the dev-only secret outside production', () => {
    expect(resolveGuestSessionSecret({ NODE_ENV: 'test' })).toMatch(/dev-only/)
  })

  it('refuses to fall back to a default secret in production', () => {
    expect(() => resolveGuestSessionSecret({ NODE_ENV: 'production' })).toThrow(
      /GUEST_SESSION_SECRET must be set/,
    )
  })
})
