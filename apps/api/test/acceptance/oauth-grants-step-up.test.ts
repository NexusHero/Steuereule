// ADR-0106 D2/D5 — an assistant connection (OAuth consent + refresh token) made from a stolen session.
// Before: any session cookie could consent without re-authentication, and the refresh token kept minting
// access tokens after the victim changed the password. Now consent needs a fresh sign-in or a re-entered
// password, and a password change ends every assistant connection of the account.
// Real Postgres, real HTTP against `buildApp()`.
import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ORIGIN = 'https://allowed.example.com'
const PASSWORD = 'a-fine-strong-password-1'
const REDIRECT = 'http://127.0.0.1:49999/callback'
const SCOPE = 'openid steuerdaten:read offline_access'

describe('assistant connections and step-up (ADR-0106 D2/D5)', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'oauth-step-up-secret',
      BETTER_AUTH_SECRET: 'oauth-step-up-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39983',
      CORS_ALLOWED_ORIGINS: ORIGIN,
    },
    // OauthResource stays: the MCP resource is seeded once per process (ensureMcpResource).
    cleanup: async () => {
      for (const table of ['OauthRefreshToken', 'OauthAccessToken', 'OauthConsent', 'OauthClientResource', 'OauthClient']) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`).catch(() => {})
      }
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.verification.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  const resource = (): string => `${process.env.BETTER_AUTH_URL}/mcp`
  const form = (body: Record<string, string>): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })

  async function registerClient(): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Probe', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    })
    expect(response.status).toBe(201)
    return ((await response.json()) as { client_id: string }).client_id
  }

  /** authorize → consent with the given cookie; returns the consent response and the PKCE verifier. */
  async function consent(cookie: string, clientId: string): Promise<{ response: Response; verifier: string }> {
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope: SCOPE, state: 's', code_challenge: challenge, code_challenge_method: 'S256', resource: resource() })
    const authorize = await fetch(`${baseUrl}/api/auth/oauth2/authorize?${query}`, { headers: { cookie }, redirect: 'manual' })
    const consentUrl = authorize.headers.get('location') ?? ((await authorize.json()) as { url: string }).url
    const response = await fetch(`${baseUrl}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ accept: true, scope: SCOPE, oauth_query: new URL(consentUrl).searchParams.toString() }),
    })
    return { response, verifier }
  }

  async function connect(cookie: string): Promise<{ clientId: string; refreshToken: string }> {
    const clientId = await registerClient()
    const { response, verifier } = await consent(cookie, clientId)
    expect(response.status).toBe(200)
    const code = new URL(((await response.json()) as { url: string }).url).searchParams.get('code')!
    const token = await fetch(`${baseUrl}/api/auth/oauth2/token`, form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: resource() }))
    expect(token.status).toBe(200)
    return { clientId, refreshToken: ((await token.json()) as { refresh_token: string }).refresh_token }
  }

  it('refuses consent from a session older than the step-up window (D2)', async () => {
    const { cookie, userId } = await signUp('oauth-stepup-old@example.com')
    await prisma.session.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } })
    const { response } = await consent(cookie, await registerClient())
    expect(response.status).toBe(403)
    expect(((await response.json()) as { code?: string }).code).toBe('FRESH_AUTH_REQUIRED')
    expect(await prisma.oauthConsent.count({ where: { userId } })).toBe(0)
  })

  it('ends the assistant connection when the password changes (D5)', async () => {
    const { cookie, userId } = await signUp('oauth-stepup-change@example.com')
    const { clientId, refreshToken } = await connect(cookie)

    const before = await fetch(`${baseUrl}/api/auth/oauth2/token`, form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: resource() }))
    expect(before.status).toBe(200)
    const rotated = ((await before.json()) as { refresh_token: string }).refresh_token

    const change = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'another-fine-password-2' }),
    })
    expect(change.status).toBe(200)

    const after = await fetch(`${baseUrl}/api/auth/oauth2/token`, form({ grant_type: 'refresh_token', refresh_token: rotated, client_id: clientId, resource: resource() }))
    expect(after.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.oauthConsent.count({ where: { userId } })).toBe(0)
    expect(await prisma.oauthRefreshToken.count({ where: { userId } })).toBe(0)
  })
})
