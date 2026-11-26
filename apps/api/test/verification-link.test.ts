import { describe, expect, it } from 'vitest'
import { redirectVerificationToWebApp } from '../src/auth/verification-link.js'

const API = 'http://localhost:3000/api/auth/verify-email?token=abc'
const WEB_APP = 'http://localhost:8080'

describe('redirectVerificationToWebApp', () => {
  it('sends the default root callback to the sign-in page with the confirmed note (WEB-5)', () => {
    const link = `${API}&callbackURL=%2F`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/login?bestaetigt=1')
  })

  it('keeps a nested relative path', () => {
    const link = `${API}&callbackURL=%2Fapp%3Fx%3D1`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/app?x=1')
  })

  it('sends a link without callbackURL to the web app root', () => {
    const result = redirectVerificationToWebApp(API, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/login?bestaetigt=1')
  })

  // ADR-0104 L2 — an off-origin callback must not be trusted; it is neutralised to the web app root.
  it('neutralises a foreign absolute callbackURL to the web app root', () => {
    const link = `${API}&callbackURL=${encodeURIComponent('https://www.example.com/app')}`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/login?bestaetigt=1')
  })

  it('neutralises a protocol-relative callbackURL (//evil.com), which would otherwise resolve to http://evil.com/', () => {
    const link = `${API}&callbackURL=${encodeURIComponent('//evil.com')}`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/login?bestaetigt=1')
  })

  it('keeps an absolute callbackURL that is already on the web app origin', () => {
    const link = `${API}&callbackURL=${encodeURIComponent('http://localhost:8080/app?x=1')}`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/app?x=1')
  })

  it('keeps the token', () => {
    const result = redirectVerificationToWebApp(`${API}&callbackURL=%2F`, WEB_APP)

    expect(new URL(result).searchParams.get('token')).toBe('abc')
  })
})
