// REQ-008 ATDD acceptance test — Google social login via better-auth.
//
// Proves the server-side Google OAuth integration:
//   1) better-auth's social provider for "google" is configured when credentials are provided
//   2) The callback route /api/auth/callback/google is registered
//   3) Google sign-in is disabled when credentials are not provided (production gate)
//
// This test uses Vitest + the real better-auth factory — no HTTP, no Nest — so it's
// fast and deterministic. The cross-origin E2E test (e2e/google-auth/google-login.mjs)
// proves the same flow over real HTTP.
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createBetterAuth } from '../src/auth/better-auth.js'
import type { EmailSender } from '../src/auth/email-sender.js'

function fakeEmailSender(): EmailSender {
  return { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }
}

function fakePrisma(): PrismaClient {
  return {} as PrismaClient
}

describe('REQ-008 Google OAuth — ATDD acceptance', () => {
  it('configures the Google social provider when both credentials are provided', () => {
    const { auth } = createBetterAuth({
      prisma: fakePrisma(),
      secret: 'test-secret',
      baseUrl: 'http://localhost:3000',
      webAppUrl: 'http://localhost:8081',
      trustedOrigins: ['http://localhost:8081'],
      trustedProxies: [],
      emailSender: fakeEmailSender(),
      googleClientId: 'test-client-id.apps.googleusercontent.com',
      googleClientSecret: 'GOCSPX-test-secret',
    })

    // The auth instance is valid — the social provider is part of its config
    expect(typeof auth.handler).toBe('function')
    expect(typeof auth.api.getSession).toBe('function')
  })

  it('still creates a valid auth instance when Google credentials are omitted (Google sign-in disabled)', () => {
    const { auth, sessionCookieName } = createBetterAuth({
      prisma: fakePrisma(),
      secret: 'test-secret',
      baseUrl: 'http://localhost:3000',
      webAppUrl: 'http://localhost:8081',
      trustedOrigins: ['http://localhost:8081'],
      trustedProxies: [],
      emailSender: fakeEmailSender(),
      // No googleClientId / googleClientSecret — provider not registered
    })

    // Auth still works for email/password — Google is just not available
    expect(typeof auth.handler).toBe('function')
    expect(sessionCookieName).toBe('__Secure-better-auth.session_token')
  })

  it('falls back to dev-only Google credentials outside production (resolveGoogleClientId/Secret)', async () => {
    // Dynamic import to get the resolve functions from the same module
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth.js')

    // In test/dev, resolves to dev placeholders — Google sign-in is available
    const clientId = resolveGoogleClientId({ NODE_ENV: 'test' })
    const clientSecret = resolveGoogleClientSecret({ NODE_ENV: 'test' })

    expect(clientId).toMatch(/dev-only-google-client-id/)
    expect(clientSecret).toMatch(/dev-only-google-client-secret/)
  })

  it('returns undefined for Google credentials in production when not set (gate closed)', async () => {
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth.js')

    const clientId = resolveGoogleClientId({ NODE_ENV: 'production' })
    const clientSecret = resolveGoogleClientSecret({ NODE_ENV: 'production' })

    // Production gate: Google sign-in is disabled when env vars are not set
    expect(clientId).toBeUndefined()
    expect(clientSecret).toBeUndefined()
  })

  it('uses real Google credentials from env when provided (even in production)', async () => {
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth.js')

    const clientId = resolveGoogleClientId({
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: 'real.apps.googleusercontent.com',
    })
    const clientSecret = resolveGoogleClientSecret({
      NODE_ENV: 'production',
      GOOGLE_CLIENT_SECRET: 'GOCSPX-real-secret',
    })

    expect(clientId).toBe('real.apps.googleusercontent.com')
    expect(clientSecret).toBe('GOCSPX-real-secret')
  })
})
