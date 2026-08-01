import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createBetterAuth, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret } from '../src/auth/better-auth.js'
import type { EmailSender } from '../src/auth/email-sender.js'

function fakeEmailSender(): EmailSender {
  return { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }
}

describe('resolveBetterAuthSecret', () => {
  it('returns the configured BETTER_AUTH_SECRET when set', () => {
    expect(resolveBetterAuthSecret({ BETTER_AUTH_SECRET: 'configured-secret' })).toBe('configured-secret')
  })

  it('falls back to the dev-only secret outside production', () => {
    expect(resolveBetterAuthSecret({ NODE_ENV: 'test' })).toMatch(/dev-only/)
  })

  it('refuses to fall back to a default secret in production', () => {
    expect(() => resolveBetterAuthSecret({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET must be set/)
  })
})

describe('resolveBetterAuthUrl', () => {
  it('returns the configured BETTER_AUTH_URL when set', () => {
    expect(resolveBetterAuthUrl({ BETTER_AUTH_URL: 'https://api.example.com' })).toBe('https://api.example.com')
  })

  it('falls back to a localhost dev URL outside production', () => {
    expect(resolveBetterAuthUrl({ NODE_ENV: 'test' })).toMatch(/^http:\/\/localhost/)
  })

  it('refuses to fall back to a default URL in production', () => {
    expect(() => resolveBetterAuthUrl({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_URL must be set/)
  })
})

describe('createBetterAuth', () => {
  it('derives a deterministic session cookie name via better-auth’s own getCookies (never re-derived by hand)', () => {
    const { sessionCookieName } = createBetterAuth({
      prisma: {} as PrismaClient,
      secret: 'test-secret',
      baseUrl: 'http://localhost:3000',
      trustedOrigins: [],
      trustedProxies: [],
      emailSender: fakeEmailSender(),
    })

    // advanced.useSecureCookies: true (better-auth.ts) forces the `__Secure-` name
    // prefix unconditionally — deterministic across dev (http) and the deployed
    // (https) demo, so UserContextGuard's cookie-presence check never depends on
    // NODE_ENV or protocol detection.
    expect(sessionCookieName).toBe('__Secure-better-auth.session_token')
  })

  it('exposes a real Auth instance whose handler is a Web-Fetch (Request) => Response function', () => {
    const { auth } = createBetterAuth({
      prisma: {} as PrismaClient,
      secret: 'test-secret',
      baseUrl: 'http://localhost:3000',
      trustedOrigins: [],
      trustedProxies: [],
      emailSender: fakeEmailSender(),
    })

    expect(typeof auth.handler).toBe('function')
    expect(typeof auth.api.getSession).toBe('function')
  })
})

describe('resolveGoogleClientId', () => {
  it('returns the configured GOOGLE_CLIENT_ID when set', () => {
    expect(resolveGoogleClientId({ GOOGLE_CLIENT_ID: 'real-client-id.apps.googleusercontent.com' })).toBe(
      'real-client-id.apps.googleusercontent.com',
    )
  })

  it('falls back to the dev-only placeholder outside production', () => {
    expect(resolveGoogleClientId({ NODE_ENV: 'test' })).toMatch(/dev-only-google-client-id/)
  })

  it('returns undefined in production when not set (Google sign-in disabled)', () => {
    expect(resolveGoogleClientId({ NODE_ENV: 'production' })).toBeUndefined()
  })
})

describe('resolveGoogleClientSecret', () => {
  it('returns the configured GOOGLE_CLIENT_SECRET when set', () => {
    expect(resolveGoogleClientSecret({ GOOGLE_CLIENT_SECRET: 'GOCSPX-real-secret' })).toBe('GOCSPX-real-secret')
  })

  it('falls back to the dev-only placeholder outside production', () => {
    expect(resolveGoogleClientSecret({ NODE_ENV: 'test' })).toMatch(/dev-only-google-client-secret/)
  })

  it('returns undefined in production when not set (Google sign-in disabled)', () => {
    expect(resolveGoogleClientSecret({ NODE_ENV: 'production' })).toBeUndefined()
  })
})

// REQ-008 capability probe: the login screen must know whether Google sign-in is
// genuinely available *before* offering it, so it can stay silent instead of showing a
// button whose every press ends in "provider not found". The bundle reports the exact
// `socialProviders` object handed to better-auth — not a second read of the env — so the
// probe can never claim a provider the server would reject.
describe('createBetterAuth — enabledSocialProviders', () => {
  const base = {
    prisma: {} as PrismaClient,
    secret: 'test-secret-at-least-32-characters-long!!',
    baseUrl: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
    trustedProxies: [],
    emailSender: fakeEmailSender(),
  }

  it('reports google when both credentials are provided', () => {
    const bundle = createBetterAuth({ ...base, googleClientId: 'id', googleClientSecret: 'secret' })
    expect(bundle.enabledSocialProviders).toEqual(['google'])
  })

  it('reports nothing when the credentials are absent — the unconfigured deployment', () => {
    const bundle = createBetterAuth({ ...base, googleClientId: undefined, googleClientSecret: undefined })
    expect(bundle.enabledSocialProviders).toEqual([])
  })

  it('reports nothing when only one half of the pair is set (a half-configured provider is not usable)', () => {
    const bundle = createBetterAuth({ ...base, googleClientId: 'id', googleClientSecret: undefined })
    expect(bundle.enabledSocialProviders).toEqual([])
  })
})
