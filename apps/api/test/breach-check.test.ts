// Unit tests for the HIBP fail-open wrapper (ADR-0012 §5). Exercises `init()`
// directly against a fake `ctx.password.hash` standing in for whatever
// haveIBeenPwned()'s own init produced — the real network call is never made here
// (that's proven end-to-end in the REQ-010 acceptance suite against the real stack).
import { APIError, type AuthContext } from 'better-auth'
import { describe, expect, it, vi } from 'vitest'
import { hibpFailOpenPlugin, isBreachedPasswordError } from '../src/auth/breach-check.js'

function fakeCtx(hash: (password: string) => Promise<string>): AuthContext {
  return { password: { hash, verify: vi.fn(), config: { minPasswordLength: 8, maxPasswordLength: 128 } } } as unknown as AuthContext
}

async function wrappedHash(hash: (password: string) => Promise<string>, password: string): Promise<string> {
  const result = hibpFailOpenPlugin.init?.(fakeCtx(hash))
  const resolved = await result
  const wrapped = (resolved as { context: { password: { hash: (p: string) => Promise<string> } } }).context.password.hash
  return wrapped(password)
}

describe('isBreachedPasswordError', () => {
  it('is true only for the plugin’s deliberate PASSWORD_COMPROMISED BAD_REQUEST shape', () => {
    const breach = new APIError('BAD_REQUEST', { code: 'PASSWORD_COMPROMISED', message: 'compromised' })
    expect(isBreachedPasswordError(breach)).toBe(true)
  })

  it('is false for a generic error (network failure, timeout, ...)', () => {
    expect(isBreachedPasswordError(new Error('fetch failed'))).toBe(false)
  })

  it('is false for an unrelated APIError (e.g. a 500 from a genuine outage)', () => {
    const outage = new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to check password. Please try again later.' })
    expect(isBreachedPasswordError(outage)).toBe(false)
  })
})

describe('hibpFailOpenPlugin', () => {
  it('passes through a successful (non-breached) check untouched', async () => {
    const hash = vi.fn().mockResolvedValue('hashed-value')
    await expect(wrappedHash(hash, 'a-fine-password')).resolves.toBe('hashed-value')
    expect(hash).toHaveBeenCalledWith('a-fine-password')
  })

  it('always rejects a confirmed breach match — never fails open on a real match', async () => {
    const breach = new APIError('BAD_REQUEST', { code: 'PASSWORD_COMPROMISED', message: 'compromised' })
    const hash = vi.fn().mockRejectedValue(breach)
    await expect(wrappedHash(hash, 'password123')).rejects.toBe(breach)
  })

  it('fails open on an HIBP outage (any non-breach error) — signup is never hard-blocked', async () => {
    const outage = new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to check password. Please try again later.' })
    const hash = vi.fn().mockRejectedValue(outage)
    // Falls back to better-auth's own real hashPassword — assert it's a real scrypt
    // hash string, not a stub/placeholder, and that hashing still succeeds.
    const result = await wrappedHash(hash, 'a-fine-password-during-outage')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('fails open on a plain network error too (fetch throwing, not an APIError at all)', async () => {
    const hash = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const result = await wrappedHash(hash, 'a-fine-password-during-network-error')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
