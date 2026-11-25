import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import { AcceptsAssistantToken } from '../src/auth/accepts-assistant-token.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, generateKeyPairSync, sign as signWith } from 'node:crypto'
import { signGuestSession } from '../src/auth/guest-session.js'
import {
  AUTH_CONTEXT_REQUEST_KEY,
  EMAIL_VERIFIED_REQUEST_KEY,
  GUEST_SESSION_COOKIE,
  USER_ID_KIND_REQUEST_KEY,
  USER_ID_REQUEST_KEY,
  UserContextGuard,
} from '../src/auth/user-context.guard.js'
import { SESSION_ABSOLUTE_MAX_AGE_MS } from '../src/auth/session-lifetime.js'
import type { BetterAuthBundle } from '../src/auth/auth.tokens.js'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import type { AssistantClient, BearerTokenRepository } from '../src/auth/bearer-token.repository.js'

function fakeTokens(overrides: Partial<Record<keyof BearerTokenRepository, ReturnType<typeof vi.fn>>> = {}) {
  return {
    findOpaqueToken: overrides.findOpaqueToken ?? vi.fn().mockResolvedValue(null),
    findClient: overrides.findClient ?? vi.fn().mockResolvedValue(null),
    hasConsent: overrides.hasConsent ?? vi.fn().mockResolvedValue(false),
  } satisfies BearerTokenRepository
}

const SECRET = 'test-secret'
const SESSION_COOKIE_NAME = 'better-auth.session_token'

@AcceptsAssistantToken()
class McpLikeController {
  readonly kind = 'mcp'
}
class OrdinaryController {
  readonly kind = 'ordinary'
}

// A bearer token is only looked at on the MCP endpoint; cookies and guests are tested on an ordinary controller,
// because the MCP endpoint refuses every request without a token (beta P4, MCP-9).
function makeContext(cookies: Record<string, string | undefined>, headers: Record<string, string | undefined> = {}, controller: object = headers.authorization ? McpLikeController : OrdinaryController, url = '/mcp') {
  const request: Record<string, unknown> = { cookies, headers, url }
  const setCookie = vi.fn()
  const header = vi.fn()
  const clearCookie = vi.fn()
  const reply = { setCookie, header, clearCookie }
  const context = {
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext
  return { context, request, setCookie, header, clearCookie }
}

function makeBetterAuthBundle(getSession: ReturnType<typeof vi.fn>): BetterAuthBundle {
  return {
    // Only `api.getSession` is ever called by the guard — the rest of `Auth` is
    // irrelevant to this unit test, so it's deliberately left out of the fake shape.
    auth: { api: { getSession }, options: { baseURL: 'https://api.example.test' } } as unknown as BetterAuthBundle['auth'],
    sessionCookieName: SESSION_COOKIE_NAME,
    // The guard never reads this; it belongs to the capability probe (REQ-008).
    enabledSocialProviders: [],
    rateLimitStorage: createResettableRateLimitStorage(),
  }
}

describe('UserContextGuard', () => {
  beforeEach(() => {
    process.env.GUEST_SESSION_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  // MCP-9, H2-27: an MCP client before sign-in gets the pointer to the sign-in, never a guest identity.
  it('on the MCP endpoint answers a request without a token with 401 and WWW-Authenticate, and makes no guest', async () => {
    const touch = vi.fn().mockResolvedValue(undefined)
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens(), { seen: vi.fn(), touch } as never)
    for (const [url, resource] of [['/mcp', '/mcp'], ['/mcp/messages?sessionId=x', '/mcp/sse'], ['/mcp/sse', '/mcp/sse']] as const) {
      const { context, request, setCookie, header } = makeContext({}, {}, McpLikeController, url)
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
      expect(header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource${resource}"`)
      expect(setCookie).not.toHaveBeenCalled()
      expect(request[USER_ID_REQUEST_KEY]).toBeUndefined()
    }
    // Not even a session cookie of the user's browser makes it a user request there.
    const withCookie = makeContext({ [SESSION_COOKIE_NAME]: 'sess' }, {}, McpLikeController)
    await expect(guard.canActivate(withCookie.context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(getSession).not.toHaveBeenCalled()
    expect(touch).not.toHaveBeenCalled()
  })

  // MCP-14: an invalid or expired token on the MCP endpoint says so in the challenge, so a client refreshes.
  it('names invalid_token in the challenge when the MCP endpoint refuses a token', async () => {
    const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), fakeTokens())
    const { context, header } = makeContext({}, { authorization: 'Bearer nonexistent-token' })
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(header).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('error="invalid_token"'))
  })

  it('trusts a valid signed guest cookie and does not mint a new one (no better-auth session cookie present)', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
    const existingUserId = 'existing-user'
    const token = signGuestSession(existingUserId, SECRET)
    const { context, request, setCookie } = makeContext({ [GUEST_SESSION_COOKIE]: token })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).toBe(existingUserId)
    // #318 — a verified guest cookie is still 'guest', never 'session'.
    expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('guest')
    expect(setCookie).not.toHaveBeenCalled()
    // I/O-free guest path (ADR-0012 §2): no better-auth session cookie means no DB read.
    expect(getSession).not.toHaveBeenCalled()
  })

  it('mints a fresh userId and sets a cookie when no cookie is present, without touching better-auth', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
    const { context, request, setCookie } = makeContext({})

    await expect(guard.canActivate(context)).resolves.toBe(true)
    const userId = request[USER_ID_REQUEST_KEY]
    expect(typeof userId).toBe('string')
    expect((userId as string).length).toBeGreaterThan(0)
    expect(setCookie).toHaveBeenCalledOnce()
    const [cookieName, cookieValue, options] = setCookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(cookieName).toBe(GUEST_SESSION_COOKIE)
    expect(cookieValue.startsWith(`${userId as string}.`)).toBe(true)
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('none')
    expect(options.secure).toBe(true)
    expect(getSession).not.toHaveBeenCalled()
    // #318 — a freshly-minted guest is 'guest', never 'session'.
    expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('guest')
  })

  it('mints a fresh userId when the guest cookie is tampered/forged (never trusts it)', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
    const { context, request, setCookie } = makeContext({
      [GUEST_SESSION_COOKIE]: 'attacker-supplied-user-id.deadbeef',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).not.toBe('attacker-supplied-user-id')
    expect(setCookie).toHaveBeenCalledOnce()
  })

  it('two requests with no cookie get two different userIds (no cross-request leakage)', async () => {
    const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), fakeTokens())
    const first = makeContext({})
    const second = makeContext({})

    await guard.canActivate(first.context)
    await guard.canActivate(second.context)

    expect(first.request[USER_ID_REQUEST_KEY]).not.toBe(second.request[USER_ID_REQUEST_KEY])
  })

  // --- ADR-0012 §2: a verified better-auth session wins over a guest cookie ---
  describe('a better-auth session cookie is present', () => {
    it('a verified session wins: userId = session.user.id, and no guest cookie is minted or touched', async () => {
      const getSession = vi.fn().mockResolvedValue({ user: { id: 'real-account-id' }, session: {} })
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
      // Even carrying a guest cookie too (e.g. a browser that never cleared it) — the
      // verified session must still win per ADR-0012 §2's precedence rule.
      const guestToken = signGuestSession('some-guest', SECRET)
      const { context, request, setCookie } = makeContext({
        [SESSION_COOKIE_NAME]: 'a-better-auth-session-cookie-value',
        [GUEST_SESSION_COOKIE]: guestToken,
      })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).toBe('real-account-id')
      // #318 — the signal @RequiresAccount() reads: a verified session is 'session'.
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('session')
      expect(setCookie).not.toHaveBeenCalled()
      expect(getSession).toHaveBeenCalledOnce()
    })

    it('WEB-24: an expired/revoked session is refused with 401 SESSION_EXPIRED and its cookie cleared, never turned into a guest', async () => {
      const getSession = vi.fn().mockResolvedValue(null)
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
      const { context, request, setCookie, clearCookie } = makeContext({
        [SESSION_COOKIE_NAME]: 'a-revoked-session-cookie-value',
      })

      await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'SESSION_EXPIRED', kind: 'unauthenticated' })
      // A signed-in user's save must not silently land in a freshly minted guest account.
      expect(setCookie).not.toHaveBeenCalled()
      expect(request[USER_ID_REQUEST_KEY]).toBeUndefined()
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBeUndefined()
      expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, { path: '/' })
    })
  })

  // --- ADR-0103 §2: an absolute cap on session age (freshAge stays 0, ADR-0027) ---
  describe('absolute session cap', () => {
    it('refuses a session older than the absolute cap with 401 SESSION_EXPIRED (never left as "session")', async () => {
      const createdAt = new Date(Date.now() - (SESSION_ABSOLUTE_MAX_AGE_MS + 60_000))
      const getSession = vi.fn().mockResolvedValue({ user: { id: 'real-account-id', emailVerified: true }, session: { createdAt } })
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
      const { context, request } = makeContext({ [SESSION_COOKIE_NAME]: 'an-indefinitely-renewed-cookie' })

      await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
      // An over-cap session must never leave the request as 'session' — that would admit a stolen,
      // forever-renewed cookie past @RequiresAccount().
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBeUndefined()
      expect(request[USER_ID_REQUEST_KEY]).toBeUndefined()
    })

    it('accepts a session created within the cap and stashes emailVerified', async () => {
      const createdAt = new Date(Date.now() - 60_000)
      const getSession = vi.fn().mockResolvedValue({ user: { id: 'real-account-id', emailVerified: true }, session: { createdAt } })
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
      const { context, request } = makeContext({ [SESSION_COOKIE_NAME]: 'a-fresh-cookie' })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('session')
      expect(request[EMAIL_VERIFIED_REQUEST_KEY]).toBe(true)
    })

    it('stashes emailVerified = false for a signed-in but unverified account', async () => {
      const getSession = vi.fn().mockResolvedValue({ user: { id: 'u1', emailVerified: false }, session: { createdAt: new Date() } })
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())
      const { context, request } = makeContext({ [SESSION_COOKIE_NAME]: 'fresh' })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('session')
      expect(request[EMAIL_VERIFIED_REQUEST_KEY]).toBe(false)
    })
  })

  // --- ADR-0052 §2/§4/§10: OAuth 2.1 Bearer Token for Assistants ---
  describe('OAuth 2.1 Bearer Token', () => {
    function hashToken(raw: string): string {
      return createHash('sha256').update(raw).digest('base64url')
    }

    it('refuses an assistant token on every controller but the MCP endpoint, before looking it up', async () => {
      const findUnique = vi.fn()
      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), fakeTokens({ findOpaqueToken: findUnique }))
      const { context, request } = makeContext({}, { authorization: 'Bearer some-valid-token' }, OrdinaryController)
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
      expect(findUnique).not.toHaveBeenCalled()
      expect(request[USER_ID_REQUEST_KEY]).toBeUndefined()
    })

    it('a valid bearer token sets userId, userIdKind = bearer, and authContext with assistant info', async () => {
      const rawToken = 'test-access-token-123'
      const hashed = hashToken(rawToken)
      const tokenRecord = {
        userId: 'oauth-user-id',
        clientId: 'client-1',
        scopes: ['openid', 'steuerdaten:read', 'steuerdaten:write'],
        expiresAt: new Date(Date.now() + 60_000),
        revoked: null,
        client: { clientId: 'client-1', name: 'Claude Assistant', disabled: false },
      }
      const tokens = fakeTokens({ findOpaqueToken: vi.fn().mockResolvedValue(tokenRecord) })

      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), tokens)
      const { context, request, setCookie } = makeContext({}, { authorization: `Bearer ${rawToken}` })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).toBe('oauth-user-id')
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('bearer')
      expect(request[AUTH_CONTEXT_REQUEST_KEY]).toEqual({
        source: 'assistent',
        clientId: 'client-1',
        clientName: 'Claude Assistant',
        scopes: ['openid', 'steuerdaten:read', 'steuerdaten:write'],
      })
      expect(setCookie).not.toHaveBeenCalled()
      expect(tokens.findOpaqueToken).toHaveBeenCalledWith(hashed)
    })

    it('an expired bearer token throws UnauthorizedException (never falls back to guest)', async () => {
      const rawToken = 'expired-token'
      const tokenRecord = {
        userId: 'oauth-user-id',
        clientId: 'client-1',
        scopes: ['openid'],
        expiresAt: new Date(Date.now() - 1000), // expired
        revoked: null,
        client: { clientId: 'client-1', name: 'Claude', disabled: false },
      }
      const tokens = fakeTokens({ findOpaqueToken: vi.fn().mockResolvedValue(tokenRecord) })

      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), tokens)
      const { context, setCookie } = makeContext({}, { authorization: `Bearer ${rawToken}` })

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
      expect(setCookie).not.toHaveBeenCalled()
    })

    it('a revoked bearer token throws UnauthorizedException', async () => {
      const rawToken = 'revoked-token'
      const tokenRecord = {
        userId: 'oauth-user-id',
        clientId: 'client-1',
        scopes: ['openid'],
        expiresAt: new Date(Date.now() + 60_000),
        revoked: new Date(), // revoked
        client: { clientId: 'client-1', name: 'Claude', disabled: false },
      }
      const tokens = fakeTokens({ findOpaqueToken: vi.fn().mockResolvedValue(tokenRecord) })

      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), tokens)
      const { context, setCookie } = makeContext({}, { authorization: `Bearer ${rawToken}` })

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
      expect(setCookie).not.toHaveBeenCalled()
    })

    it('an unknown bearer token throws UnauthorizedException', async () => {
      const tokens = fakeTokens({ findOpaqueToken: vi.fn().mockResolvedValue(null) })

      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), tokens)
      const { context, setCookie } = makeContext({}, { authorization: 'Bearer nonexistent-token' })

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
      expect(setCookie).not.toHaveBeenCalled()
    })

    it('a disabled client token throws UnauthorizedException', async () => {
      const rawToken = 'token-for-disabled-client'
      const tokenRecord = {
        userId: 'oauth-user-id',
        clientId: 'client-1',
        scopes: ['openid'],
        expiresAt: new Date(Date.now() + 60_000),
        revoked: null,
        client: { clientId: 'client-1', name: 'Claude', disabled: true }, // disabled client
      }
      const tokens = fakeTokens({ findOpaqueToken: vi.fn().mockResolvedValue(tokenRecord) })

      const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()), tokens)
      const { context, setCookie } = makeContext({}, { authorization: `Bearer ${rawToken}` })

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
      expect(setCookie).not.toHaveBeenCalled()
    })

    it('sets authContext = { source: "nutzer" } for normal session and guest', async () => {
      const getSession = vi.fn().mockResolvedValue({ user: { id: 'u1' }, session: {} })
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession), fakeTokens())

      const sessionReq = makeContext({ [SESSION_COOKIE_NAME]: 'sess' })
      await guard.canActivate(sessionReq.context)
      expect(sessionReq.request[AUTH_CONTEXT_REQUEST_KEY]).toEqual({ source: 'nutzer' })

      const guestReq = makeContext({})
      await guard.canActivate(guestReq.context)
      expect(guestReq.request[AUTH_CONTEXT_REQUEST_KEY]).toEqual({ source: 'nutzer' })
    })
  })

  // MCP clients ask for a token bound to the MCP endpoint (RFC 8707): better-auth signs it as a JWT.
  describe('OAuth 2.1 JWT access token for the MCP endpoint (ADR-0052 §2)', () => {
    const BASE = 'http://localhost:3501'
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'EdDSA' }
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    function jwt(claims: Record<string, unknown>): string {
      const head = `${b64({ alg: 'EdDSA', kid: 'k1', typ: 'at+jwt' })}.${b64(claims)}`
      return `${head}.${signWith(null, Buffer.from(head), privateKey).toString('base64url')}`
    }
    const now = Math.floor(Date.now() / 1000)
    const valid = { iss: `${BASE}/api/auth`, aud: `${BASE}/mcp/sse`, sub: 'oauth-user-id', client_id: 'client-1', azp: 'client-1', scope: 'steuerdaten:read steuerdaten:write', iat: now, exp: now + 600 }

    function bundle(): BetterAuthBundle {
      return {
        auth: { api: { getSession: vi.fn(), getJwks: vi.fn().mockResolvedValue({ keys: [jwk] }) }, options: { baseURL: BASE } } as unknown as BetterAuthBundle['auth'],
        sessionCookieName: SESSION_COOKIE_NAME,
        enabledSocialProviders: [],
        rateLimitStorage: createResettableRateLimitStorage(),
      }
    }
    function tokensFor(client: AssistantClient | null = { name: 'Claude', disabled: false }, consented = true) {
      return fakeTokens({ findClient: vi.fn().mockResolvedValue(client), hasConsent: vi.fn().mockResolvedValue(consented) })
    }

    it('a JWT for the MCP endpoint sets the assistant context from its claims and the client', async () => {
      const guard = new UserContextGuard(bundle(), tokensFor())
      const { context, request } = makeContext({}, { authorization: `Bearer ${jwt(valid)}` })
      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).toBe('oauth-user-id')
      expect(request[USER_ID_KIND_REQUEST_KEY]).toBe('bearer')
      expect(request[AUTH_CONTEXT_REQUEST_KEY]).toEqual({ source: 'assistent', clientId: 'client-1', clientName: 'Claude', scopes: ['steuerdaten:read', 'steuerdaten:write'] })
    })

    it('accepts a JWT for the Streamable HTTP endpoint /mcp as well as one for /mcp/sse (ADR-0052 amendment 6)', async () => {
      const guard = new UserContextGuard(bundle(), tokensFor())
      const { context, request } = makeContext({}, { authorization: `Bearer ${jwt({ ...valid, aud: `${BASE}/mcp` })}` })
      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).toBe('oauth-user-id')
    })

    it('refuses a JWT for another audience, another issuer or a forged signature', async () => {
      for (const token of [jwt({ ...valid, aud: 'https://elsewhere.example/api' }), jwt({ ...valid, iss: 'https://evil.example' }), `${jwt(valid).slice(0, -4)}AAAA`]) {
        const guard = new UserContextGuard(bundle(), tokensFor())
        const { context } = makeContext({}, { authorization: `Bearer ${token}` })
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
      }
    })

    it('a revoked connection stops a JWT at once: no consent, no access (ADR-0052 §10)', async () => {
      const guard = new UserContextGuard(bundle(), tokensFor(undefined, false))
      const { context } = makeContext({}, { authorization: `Bearer ${jwt(valid)}` })
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('refuses a JWT of a disabled client and one without a user (client credentials)', async () => {
      const disabled = new UserContextGuard(bundle(), tokensFor({ name: 'Claude', disabled: true }))
      await expect(disabled.canActivate(makeContext({}, { authorization: `Bearer ${jwt(valid)}` }).context)).rejects.toBeInstanceOf(UnauthorizedException)
      const machine = new UserContextGuard(bundle(), tokensFor())
      await expect(machine.canActivate(makeContext({}, { authorization: `Bearer ${jwt({ ...valid, sub: 'client-1' })}` }).context)).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })
})

describe('UserContextGuard — new guests per address (API-9)', () => {
  beforeEach(() => {
    process.env.GUEST_SESSION_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  it('lets one address start at most 20 guests with data an hour; a known guest keeps writing', async () => {
    const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn().mockResolvedValue(null)), fakeTokens())
    const write = (cookies: Record<string, string | undefined>) => {
      const { context, request } = makeContext(cookies, {}, OrdinaryController)
      request.method = 'PUT'
      request.ip = '198.51.100.9'
      return guard.canActivate(context)
    }
    for (let i = 0; i < 20; i++) await expect(write({})).resolves.toBe(true)
    await expect(write({})).rejects.toThrow('Zu viele Änderungen ohne Konto')
    await expect(write({ [GUEST_SESSION_COOKIE]: signGuestSession('known-guest', SECRET) })).resolves.toBe(true)
  })
})
