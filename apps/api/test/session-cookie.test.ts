// Fast, DB-free sanity checks on signBetterAuthCookieValue's shape (#238 task 2).
// The real proof that this actually interoperates with better-auth's own
// getSession() is the round trip in
// test/acceptance/req-014-device-approve-token.integration.test.ts — this file only
// covers the function's own, pure behaviour.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { signBetterAuthCookieValue } from '../src/device/session-cookie.js'

describe('signBetterAuthCookieValue', () => {
  it('returns "${value}.${signature}", never the raw value alone', () => {
    const signed = signBetterAuthCookieValue('a-session-token', 'a-secret')
    expect(signed.startsWith('a-session-token.')).toBe(true)
    expect(signed).not.toBe('a-session-token')
  })

  it('is deterministic for the same value+secret', () => {
    const a = signBetterAuthCookieValue('tok', 'secret')
    const b = signBetterAuthCookieValue('tok', 'secret')
    expect(a).toBe(b)
  })

  it('changes if the secret changes — a wrong secret can never forge a valid signature', () => {
    const a = signBetterAuthCookieValue('tok', 'secret-1')
    const b = signBetterAuthCookieValue('tok', 'secret-2')
    expect(a).not.toBe(b)
  })

  it('matches HMAC-SHA256 + standard base64 exactly (better-call\'s own signCookieValue algorithm)', () => {
    const expectedSignature = createHmac('sha256', 'a-secret').update('a-session-token').digest('base64')
    expect(signBetterAuthCookieValue('a-session-token', 'a-secret')).toBe(`a-session-token.${expectedSignature}`)
  })
})
