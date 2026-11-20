import { afterEach, describe, expect, it, vi } from 'vitest'
import { carryAssistantSignIn, isAssistantSignIn } from './assistant-sign-in'

const SIGNED = '?client_id=c1&scope=steuerdaten%3Aread&ba_param=client_id&ba_param=scope&sig=abc'

describe('assistant sign-in across login and registration (ADR-0052 §2)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('recognises the signed OAuth request in the address', () => {
    expect(isAssistantSignIn(SIGNED)).toBe(true)
    expect(isAssistantSignIn('?client_id=c1')).toBe(false)
    expect(isAssistantSignIn('')).toBe(false)
  })

  it('moves to the other page with the signed request exactly as it is, repeated keys included', () => {
    window.history.replaceState(null, '', `/login${SIGNED}`)
    const go = vi.fn()
    expect(carryAssistantSignIn('/registrierung', go)).toBe(true)
    expect(go).toHaveBeenCalledWith(`/registrierung${SIGNED}`)
  })

  it('leaves an ordinary switch to the app’s navigation', () => {
    window.history.replaceState(null, '', '/login')
    const go = vi.fn()
    expect(carryAssistantSignIn('/registrierung', go)).toBe(false)
    expect(go).not.toHaveBeenCalled()
  })
})
