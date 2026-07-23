import { describe, it, expect } from 'vitest'
import { authErrorKey } from './authErrors'

describe('authErrorKey', () => {
  it('maps INVALID_EMAIL_OR_PASSWORD (better-auth sign-in) to the honest credentials key', () => {
    expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe('errInvalidCredentials')
  })

  it('maps USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL (better-auth sign-up) to the taken-email key', () => {
    expect(authErrorKey({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', status: 422 })).toBe('errEmailTaken')
  })

  it('maps PASSWORD_TOO_SHORT to the password-policy key', () => {
    expect(authErrorKey({ code: 'PASSWORD_TOO_SHORT', status: 400 })).toBe('errPasswordTooShort')
  })

  it('maps PASSWORD_COMPROMISED (better-auth HIBP breach-check plugin, REQ-010) to the breach key', () => {
    expect(authErrorKey({ code: 'PASSWORD_COMPROMISED', status: 400 })).toBe('errPasswordCompromised')
  })

  it('falls back to the generic honest error for an unrecognized code', () => {
    expect(authErrorKey({ code: 'SOME_FUTURE_CODE', status: 400 })).toBe('errGeneric')
  })

  it('falls back to the generic honest error for a plain network failure (no code at all)', () => {
    expect(authErrorKey({ message: 'Failed to fetch' })).toBe('errGeneric')
  })

  it('falls back to the generic honest error when there is no error object', () => {
    expect(authErrorKey(null)).toBe('errGeneric')
    expect(authErrorKey(undefined)).toBe('errGeneric')
  })
})
