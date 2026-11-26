// REQ-008 ATDD acceptance test — Google social login via better-auth.
//
// Proves the server-side Google OAuth integration:
//   1) with credentials, starting the Google sign-in answers a redirect to Google carrying the
//      client id and the /api/auth/callback/google redirect URI
//   2) without credentials, the same request answers PROVIDER_NOT_FOUND (production gate)
//
// This test uses Vitest + the real better-auth factory and handler — no Nest, no socket — so it's
// fast and deterministic. The cross-origin E2E test (e2e/google-auth/google-login.mjs)
// proves the same flow over real HTTP.
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createBetterAuth } from '../src/auth/better-auth.js'
import type { EmailSender } from '../src/auth/email-sender.js'

function fakeEmailSender(): EmailSender {
  return { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendExistingAccountNotice: vi.fn(), sendUnverifiedAccountWarning: vi.fn() }
}

function fakePrisma(): PrismaClient {
  return {} as PrismaClient
}

/** The state better-auth stores before it sends a user to the provider; the one table the sign-in start writes. */
function prismaStoringTheOAuthState(): PrismaClient {
  return { verification: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'state-1', createdAt: new Date(), updatedAt: new Date(), ...data }) } } as unknown as PrismaClient
}

function startGoogleSignIn(auth: { handler: (request: Request) => Promise<Response> }): Promise<Response> {
  return auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:8081' },
      body: JSON.stringify({ provider: 'google', callbackURL: 'http://localhost:8081/' }),
    }),
  )
}

const base = {
  secret: 'test-secret-at-least-32-characters-long!!',
  baseUrl: 'http://localhost:3000',
  webAppUrl: 'http://localhost:8081',
  trustedOrigins: ['http://localhost:8081'],
}

describe('REQ-008 Google OAuth — ATDD acceptance', () => {
  it('registers the Google provider and starts the sign-in at Google when both credentials are provided', async () => {
    const { auth, enabledSocialProviders } = createBetterAuth({
      ...base,
      prisma: prismaStoringTheOAuthState(),
      emailSender: fakeEmailSender(),
      googleClientId: 'test-client-id.apps.googleusercontent.com',
      googleClientSecret: 'GOCSPX-test-secret',
    })

    expect(enabledSocialProviders).toEqual(['google'])
    const response = await startGoogleSignIn(auth)
    expect(response.status).toBe(200)
    const { url } = (await response.json()) as { url: string }
    const target = new URL(url)
    expect(target.origin).toBe('https://accounts.google.com')
    expect(target.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com')
    // The callback route better-auth hands Google is the registered /api/auth/callback/google.
    expect(target.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/google')
  })

  it('does not register the Google provider without credentials: the sign-in start answers PROVIDER_NOT_FOUND', async () => {
    const { auth, enabledSocialProviders, sessionCookieName } = createBetterAuth({ ...base, prisma: fakePrisma(), emailSender: fakeEmailSender() })

    expect(enabledSocialProviders).toEqual([])
    const response = await startGoogleSignIn(auth)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'PROVIDER_NOT_FOUND' })
    // Email/password is unaffected.
    expect(sessionCookieName).toBe('better-auth.session_token')
  })

  it('falls back to dev-only Google credentials outside production (resolveGoogleClientId/Secret)', async () => {
    // Dynamic import to get the resolve functions from the same module
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth-env.js')

    // In test/dev, resolves to dev placeholders — Google sign-in is available
    const clientId = resolveGoogleClientId({ NODE_ENV: 'test' })
    const clientSecret = resolveGoogleClientSecret({ NODE_ENV: 'test' })

    expect(clientId).toMatch(/dev-only-google-client-id/)
    expect(clientSecret).toMatch(/dev-only-google-client-secret/)
  })

  it('returns undefined for Google credentials in production when not set (gate closed)', async () => {
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth-env.js')

    const clientId = resolveGoogleClientId({ NODE_ENV: 'production' })
    const clientSecret = resolveGoogleClientSecret({ NODE_ENV: 'production' })

    // Production gate: Google sign-in is disabled when env vars are not set
    expect(clientId).toBeUndefined()
    expect(clientSecret).toBeUndefined()
  })

  it('uses real Google credentials from env when provided (even in production)', async () => {
    const { resolveGoogleClientId, resolveGoogleClientSecret } = await import('../src/auth/better-auth-env.js')

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
