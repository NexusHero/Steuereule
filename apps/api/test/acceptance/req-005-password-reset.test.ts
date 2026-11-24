// ADR-0109 — password reset by e-mail, against the real server (real Postgres, real HTTP).
import { createHash } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseUrl, prisma, useAcceptanceServer, verifyAndSignIn } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const WEB = 'https://app.example.com'
const HEADERS = { 'content-type': 'application/json', origin: ALLOWED_ORIGIN }
const OLD_PASSWORD = 'a-fine-strong-password-1'
const NEW_PASSWORD = 'another-fine-strong-password-2'

describe('password reset by e-mail', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'reset-secret',
      BETTER_AUTH_SECRET: 'reset-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39982',
      WEB_APP_URL: WEB,
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      vi.unstubAllGlobals()
      await prisma.oauthConsent.deleteMany()
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.verification.deleteMany()
      await prisma.user.deleteMany()
      // The next suite reads the whole access log; leave none behind.
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    },
  })

  const spies: { mockRestore(): void }[] = []
  afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()))

  /** HIBP is stubbed: nothing matches, or (`breached`) the given password does. */
  function stubBreachCheck(breached?: string) {
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (!url.startsWith('https://api.pwnedpasswords.com/range/')) return realFetch(input, init)
      const suffix = breached ? createHash('sha1').update(breached, 'utf8').digest('hex').toUpperCase().slice(5) : '0'.repeat(35)
      return new Response(`${suffix}:${breached ? 1 : 0}`, { status: 200 })
    })
  }

  async function signUp(email: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email, password: OLD_PASSWORD, name: 'Reset Me' }) })
    expect(res.status).toBe(200)
    const signedIn = await verifyAndSignIn(email, OLD_PASSWORD)
    return signedIn.headers.get('set-cookie')!.split(';')[0]!
  }

  const request = (email: string, redirectTo: string | undefined = `${WEB}/passwort-zuruecksetzen`) =>
    fetch(`${baseUrl}/api/auth/request-password-reset`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email, ...(redirectTo ? { redirectTo } : {}) }) })

  async function requestAndReadLink(email: string): Promise<string> {
    const spy = vi.spyOn(Logger.prototype, 'warn')
    spies.push(spy)
    expect((await request(email)).status).toBe(200)
    const masked = `${email.slice(0, 1)}***@${email.split('@')[1]}`
    const line = spy.mock.calls.map((call) => String(call[0])).find((l) => l.startsWith(`password-reset link for ${masked}`))
    expect(line).toBeDefined()
    return line!.split(': ')[1]!
  }

  it('mails better-auth\'s own callback link, which hands a single-use token to the web app; the new password works, the old one and every session do not', async () => {
    stubBreachCheck()
    const cookie = await signUp('reset-me@example.com')
    const link = await requestAndReadLink('reset-me@example.com')
    expect(new URL(link).origin).toBe('http://127.0.0.1:39982')

    // The server listens on an ephemeral port; the mailed link names the configured base URL.
    const callback = await fetch(`${baseUrl}${new URL(link).pathname}${new URL(link).search}`, { redirect: 'manual' })
    expect(callback.status).toBe(302)
    const landing = new URL(callback.headers.get('location')!)
    expect(`${landing.origin}${landing.pathname}`).toBe(`${WEB}/passwort-zuruecksetzen`)
    const token = landing.searchParams.get('token')!
    expect(token).toBeTruthy()
    const stored = await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}` } })
    expect(stored!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)

    const reset = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })
    expect(reset.status).toBe(200)

    const again = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ code: 'INVALID_TOKEN' })

    const oldSession = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    expect(await oldSession.json()).toBeNull()
    const oldLogin = await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email: 'reset-me@example.com', password: OLD_PASSWORD }) })
    expect(oldLogin.status).toBe(401)
    const newLogin = await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email: 'reset-me@example.com', password: NEW_PASSWORD }) })
    expect(newLogin.status).toBe(200)
  })

  it('ends the account\'s assistant connections too', async () => {
    stubBreachCheck()
    await signUp('grants@example.com')
    const user = await prisma.user.findUnique({ where: { email: 'grants@example.com' } })
    await prisma.oauthClient.create({ data: { clientId: 'c-reset', name: 'Assistent', redirectUris: ['https://x.example/cb'], userId: user!.id } })
    await prisma.oauthConsent.create({ data: { clientId: 'c-reset', userId: user!.id, scopes: ['openid'] } })
    const token = new URL(await requestAndReadLink('grants@example.com')).pathname.split('/').pop()!
    const reset = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })
    expect(reset.status).toBe(200)
    expect(await prisma.oauthConsent.count({ where: { userId: user!.id } })).toBe(0)
  })

  it('answers an unknown address exactly like a known one, and sends nothing', async () => {
    const spy = vi.spyOn(Logger.prototype, 'warn')
    spies.push(spy)
    await signUp('known@example.com')
    const known = await request('known@example.com')
    const unknown = await request('nobody@example.com')
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
    expect(spy.mock.calls.some((c) => String(c[0]).includes('n***@example.com'))).toBe(false)
  })

  it('refuses a redirect outside the web app, even to another trusted origin', async () => {
    await signUp('redir@example.com')
    // An untrusted origin is refused by better-auth's own check (403); a trusted CORS origin that is not the
    // web app by ours (400).
    expect((await request('redir@example.com', 'https://evil.example.net/x')).status).toBe(403)
    expect((await request('redir@example.com', `${ALLOWED_ORIGIN}/x`)).status).toBe(400)
    expect([400, 403]).toContain((await request('redir@example.com', `//evil.example.net/x`)).status)
  })

  it('limits requests per target address with 429, known or not', async () => {
    await signUp('mailbomb@example.com')
    for (let i = 0; i < 3; i += 1) expect((await request('mailbomb@example.com')).status).toBe(200)
    const fourth = await request('mailbomb@example.com')
    expect(fourth.status).toBe(429)
    expect(await fourth.json()).toMatchObject({ code: 'PASSWORD_RESET_LIMIT' })
  })

  it('applies the 12 character minimum and the breach check to the new password', async () => {
    await signUp('policy@example.com')
    stubBreachCheck(NEW_PASSWORD)
    const token = new URL(await requestAndReadLink('policy@example.com')).pathname.split('/').pop()!
    const short = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: 'short-pw-1', token }) })
    expect(short.status).toBe(400)
    expect(await short.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    const breached = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })
    expect(breached.status).toBe(400)
    expect(await breached.json()).toMatchObject({ code: 'PASSWORD_COMPROMISED' })
    // A refused attempt does not burn the link.
    stubBreachCheck()
    const ok = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })
    expect(ok.status).toBe(200)
  })
})
