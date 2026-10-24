import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createBetterAuth, resolveAppleClientId, resolveAppleClientSecret, resolveAppleSignInEnabled, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret } from '../src/auth/better-auth.js'
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
      webAppUrl: 'http://localhost:8081',
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
      webAppUrl: 'http://localhost:8081',
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
    webAppUrl: 'http://localhost:8081',
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

  // REQ-008 (Apple half) — the flag-flip condition. Apple is triple-gated: the feature flag
  // AND both credentials. A flag alone (no credentials) must not light the button, credentials
  // alone (no flag) must not light it either — the flag is the honest "not yet" until an Apple
  // Developer account + a shipped iOS build exist. Google is unaffected throughout.
  it('keeps Apple off when the flag is false, even with credentials present', () => {
    const bundle = createBetterAuth({ ...base, appleSignInEnabled: false, appleClientId: 'id', appleClientSecret: 'secret' })
    expect(bundle.enabledSocialProviders).toEqual([])
  })

  it('keeps Apple off when the flag is true but credentials are absent', () => {
    const bundle = createBetterAuth({ ...base, appleSignInEnabled: true, appleClientId: undefined, appleClientSecret: undefined })
    expect(bundle.enabledSocialProviders).toEqual([])
  })

  it('lights Apple only when the flag flips on AND both credentials exist', () => {
    const bundle = createBetterAuth({ ...base, appleSignInEnabled: true, appleClientId: 'id', appleClientSecret: 'secret' })
    expect(bundle.enabledSocialProviders).toEqual(['apple'])
  })

  it('keeps Google green alongside a flipped-on Apple', () => {
    const bundle = createBetterAuth({
      ...base,
      googleClientId: 'gid',
      googleClientSecret: 'gsecret',
      appleSignInEnabled: true,
      appleClientId: 'aid',
      appleClientSecret: 'asecret',
    })
    expect(bundle.enabledSocialProviders).toEqual(['google', 'apple'])
  })
})

describe('resolveAppleSignInEnabled', () => {
  it('is off by default — never lit by a credentials-less or absent-flag deployment', () => {
    expect(resolveAppleSignInEnabled({})).toBe(false)
    expect(resolveAppleSignInEnabled({ APPLE_SIGN_IN_ENABLED: 'false' })).toBe(false)
    expect(resolveAppleSignInEnabled({ APPLE_SIGN_IN_ENABLED: '1' })).toBe(false)
  })

  it('is on only on the explicit opt-in value', () => {
    expect(resolveAppleSignInEnabled({ APPLE_SIGN_IN_ENABLED: 'true' })).toBe(true)
  })
})

describe('resolveAppleClientId / resolveAppleClientSecret', () => {
  it('returns explicit values and nothing else (no dev-only fallback — Apple is gated off)', () => {
    expect(resolveAppleClientId({ APPLE_CLIENT_ID: 'com.steuereule.app' })).toBe('com.steuereule.app')
    expect(resolveAppleClientId({ NODE_ENV: 'test' })).toBeUndefined()
    expect(resolveAppleClientSecret({ APPLE_CLIENT_SECRET: 'signed-jwt' })).toBe('signed-jwt')
    expect(resolveAppleClientSecret({})).toBeUndefined()
  })
})
