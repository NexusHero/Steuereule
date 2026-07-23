import type { ExecutionContext } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signGuestSession } from '../src/auth/guest-session.js'
import { GUEST_SESSION_COOKIE, USER_ID_REQUEST_KEY, UserContextGuard } from '../src/auth/user-context.guard.js'

const SECRET = 'test-secret'

function makeContext(cookies: Record<string, string | undefined>) {
  const request: Record<string, unknown> = { cookies }
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

describe('UserContextGuard', () => {
  beforeEach(() => {
    process.env.GUEST_SESSION_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  it('trusts a valid signed cookie and does not mint a new one', () => {
    const guard = new UserContextGuard()
    const existingUserId = 'existing-user'
    const token = signGuestSession(existingUserId, SECRET)
    const { context, request, setCookie } = makeContext({ [GUEST_SESSION_COOKIE]: token })

    expect(guard.canActivate(context)).toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).toBe(existingUserId)
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('mints a fresh userId and sets a cookie when no cookie is present', () => {
    const guard = new UserContextGuard()
    const { context, request, setCookie } = makeContext({})

    expect(guard.canActivate(context)).toBe(true)
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
    // SameSite=None; Secure (ADR-0011): the web app and the API are cross-origin in both
    // local dev and the deployed demo, but only the deployed demo is cross-site (distinct
    // *.fly.dev registrable domains) — that's what forces `None`, since `strict`/`Lax` is
    // silently dropped by the browser on that cross-site credentialed request. Local dev
    // (different ports on localhost) is same-site, where `None` is just harmlessly permissive.
    expect(options.sameSite).toBe('none')
    expect(options.secure).toBe(true)
  })

  it('mints a fresh userId when the cookie is tampered/forged (never trusts it)', () => {
    const guard = new UserContextGuard()
    const { context, request, setCookie } = makeContext({
      [GUEST_SESSION_COOKIE]: 'attacker-supplied-user-id.deadbeef',
    })

    expect(guard.canActivate(context)).toBe(true)
    expect(request[USER_ID_REQUEST_KEY]).not.toBe('attacker-supplied-user-id')
    expect(setCookie).toHaveBeenCalledOnce()
  })

  it('two requests with no cookie get two different userIds (no cross-request leakage)', () => {
    const guard = new UserContextGuard()
    const first = makeContext({})
    const second = makeContext({})

    guard.canActivate(first.context)
    guard.canActivate(second.context)

    expect(first.request[USER_ID_REQUEST_KEY]).not.toBe(second.request[USER_ID_REQUEST_KEY])
  })
})
