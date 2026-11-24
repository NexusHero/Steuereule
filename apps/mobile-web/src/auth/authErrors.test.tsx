import { describe, it, expect } from 'vitest'
import { authErrorKey } from './authErrors'

describe('authErrorKey', () => {
  it('maps INVALID_EMAIL_OR_PASSWORD (better-auth sign-in) to the honest credentials key', () => {
    expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe('errInvalidCredentials')
  })

  it('maps EMAIL_NOT_VERIFIED (sign-in before the link was followed, ADR-0109)', () => {
    expect(authErrorKey({ code: 'EMAIL_NOT_VERIFIED', status: 403 })).toBe('errEmailNotVerified')
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

  // REQ-008 — social sign-in error codes map to the generic error
  it('maps PROVIDER_NOT_FOUND (social sign-in, REQ-008) to the generic key', () => {
    expect(authErrorKey({ code: 'PROVIDER_NOT_FOUND', status: 400 })).toBe('errGeneric')
  })

  it('maps INVALID_OAUTH_STATE (social sign-in, REQ-008) to the generic key', () => {
    expect(authErrorKey({ code: 'INVALID_OAUTH_STATE', status: 400 })).toBe('errGeneric')
  })

  it('maps ACCESS_DENIED (social sign-in user denied consent, REQ-008) to the generic key', () => {
    expect(authErrorKey({ code: 'ACCESS_DENIED', status: 403 })).toBe('errGeneric')
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

describe('authErrorKey with codes from the prototype', () => {
  it('maps an inherited name to the generic message, not to a function', () => {
    for (const code of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(authErrorKey({ code })).toBe('errGeneric')
    }
  })

  it('maps the per-account sign-in limit and a bare 429 to the too-many-attempts key (ADR-0106 D9)', () => {
    expect(authErrorKey({ code: 'SIGN_IN_ATTEMPTS_EXCEEDED', status: 429 })).toBe('errTooManyAttempts')
    expect(authErrorKey({ status: 429, message: 'Too many requests. Please try again later.' })).toBe('errTooManyAttempts')
  })
})
