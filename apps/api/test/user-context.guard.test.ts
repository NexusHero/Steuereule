import type { ExecutionContext } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signGuestSession } from '../src/auth/guest-session.js'
import { GUEST_SESSION_COOKIE, USER_ID_REQUEST_KEY, UserContextGuard } from '../src/auth/user-context.guard.js'
import type { BetterAuthBundle } from '../src/auth/auth.tokens.js'

const SECRET = 'test-secret'
const SESSION_COOKIE_NAME = 'better-auth.session_token'

function makeContext(cookies: Record<string, string | undefined>) {
  const request: Record<string, unknown> = { cookies, headers: {} }
  const setCookie = vi.fn()
  const reply = { setCookie }
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext
  return { context, request, setCookie }
}

function makeBetterAuthBundle(getSession: ReturnType<typeof vi.fn>): BetterAuthBundle {
  return {
    // Only `api.getSession` is ever called by the guard — the rest of `Auth` is
    // irrelevant to this unit test, so it's deliberately left out of the fake shape.
    auth: { api: { getSession } } as unknown as BetterAuthBundle['auth'],
    sessionCookieName: SESSION_COOKIE_NAME,
  }
}

describe('UserContextGuard', () => {
  beforeEach(() => {
    process.env.GUEST_SESSION_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  it('trusts a valid signed guest cookie and does not mint a new one (no better-auth session cookie present)', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession))
    const existingUserId = 'existing-user'
    const token = signGuestSession(existingUserId, SECRET)
    const { context, request, setCookie } = makeContext({ [GUEST_SESSION_COOKIE]: token })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).toBe(existingUserId)
    expect(setCookie).not.toHaveBeenCalled()
    // I/O-free guest path (ADR-0012 §2): no better-auth session cookie means no DB read.
    expect(getSession).not.toHaveBeenCalled()
  })

  it('mints a fresh userId and sets a cookie when no cookie is present, without touching better-auth', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession))
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
  })

  it('mints a fresh userId when the guest cookie is tampered/forged (never trusts it)', async () => {
    const getSession = vi.fn()
    const guard = new UserContextGuard(makeBetterAuthBundle(getSession))
    const { context, request, setCookie } = makeContext({
      [GUEST_SESSION_COOKIE]: 'attacker-supplied-user-id.deadbeef',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).not.toBe('attacker-supplied-user-id')
    expect(setCookie).toHaveBeenCalledOnce()
  })

  it('two requests with no cookie get two different userIds (no cross-request leakage)', async () => {
    const guard = new UserContextGuard(makeBetterAuthBundle(vi.fn()))
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
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession))
      // Even carrying a guest cookie too (e.g. a browser that never cleared it) — the
      // verified session must still win per ADR-0012 §2's precedence rule.
      const guestToken = signGuestSession('some-guest', SECRET)
      const { context, request, setCookie } = makeContext({
        [SESSION_COOKIE_NAME]: 'a-better-auth-session-cookie-value',
        [GUEST_SESSION_COOKIE]: guestToken,
      })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).toBe('real-account-id')
      expect(setCookie).not.toHaveBeenCalled()
      expect(getSession).toHaveBeenCalledOnce()
    })

    it('an expired/revoked session (getSession resolves null) falls through to the guest path', async () => {
      const getSession = vi.fn().mockResolvedValue(null)
      const guard = new UserContextGuard(makeBetterAuthBundle(getSession))
      const { context, request, setCookie } = makeContext({
        [SESSION_COOKIE_NAME]: 'a-revoked-session-cookie-value',
      })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request[USER_ID_REQUEST_KEY]).not.toBe('real-account-id')
      // No guest cookie existed either, so a fresh one is minted — the revoked
      // session must never leave the request without *some* trusted userId.
      expect(setCookie).toHaveBeenCalledOnce()
    })
  })
})
