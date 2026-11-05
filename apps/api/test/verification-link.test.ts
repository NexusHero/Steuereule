import { describe, expect, it } from 'vitest'
import { redirectVerificationToWebApp } from '../src/auth/verification-link.js'

const API = 'http://localhost:3000/api/auth/verify-email?token=abc'
const WEB_APP = 'http://localhost:8080'

describe('redirectVerificationToWebApp', () => {
  it('resolves a relative callbackURL against the web app instead of the API', () => {
    const link = `${API}&callbackURL=%2F`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/')
  })

  it('keeps a nested relative path', () => {
    const link = `${API}&callbackURL=%2Fapp%3Fx%3D1`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/app?x=1')
  })

  it('sends a link without callbackURL to the web app root', () => {
    const result = redirectVerificationToWebApp(API, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('http://localhost:8080/')
  })

  it('leaves an absolute callbackURL untouched', () => {
    const link = `${API}&callbackURL=${encodeURIComponent('https://www.example.com/app')}`

    const result = redirectVerificationToWebApp(link, WEB_APP)

    expect(new URL(result).searchParams.get('callbackURL')).toBe('https://www.example.com/app')
  })

  it('keeps the token', () => {
    const result = redirectVerificationToWebApp(`${API}&callbackURL=%2F`, WEB_APP)

    expect(new URL(result).searchParams.get('token')).toBe('abc')
  })
})
