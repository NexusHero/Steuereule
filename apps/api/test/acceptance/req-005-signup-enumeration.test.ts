// REQ-005 — sign-up does not reveal whether an address already has an account (ADR-0109).
// Real Postgres, real HTTP against `buildApp()`. A taken address and a free one must answer alike:
// status, body shape, cookies. The owner of a taken address is told by mail instead.
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baseUrl, prisma, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const PASSWORD = 'a-fine-strong-password-1'
const HEADERS = { 'content-type': 'application/json', origin: ALLOWED_ORIGIN }

describe('REQ-005 — sign-up is not an account-existence oracle', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-005-enum-secret',
      BETTER_AUTH_SECRET: 'req-005-enum-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39997',
      WEB_APP_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.verification.deleteMany()
      await prisma.user.deleteMany()
      // The next suite reads the whole access log; leave none behind.
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    },
  })

  let mails: string[]
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    mails = []
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      mails.push(String(message))
    })
  })
  afterEach(() => warn.mockRestore())

  const signUp = (email: string, name = 'Same Name') =>
    fetch(`${baseUrl}/api/auth/sign-up/email`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email, password: PASSWORD, name }) })
  const signIn = (email: string, password = PASSWORD) =>
    fetch(`${baseUrl}/api/auth/sign-in/email`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ email, password }) })

  it('a taken and a free address answer with the same status, body shape and no cookie', async () => {
    const free = await signUp('free@example.com')
    const freeBody = (await free.json()) as { token: unknown; user: Record<string, unknown> }
    // The account exists now; the same request again is the "taken" case.
    const taken = await signUp('free@example.com')
    const takenBody = (await taken.json()) as { token: unknown; user: Record<string, unknown> }

    expect(taken.status).toBe(free.status)
    expect(free.status).toBe(200)
    expect(freeBody.token).toBeNull()
    expect(takenBody.token).toBeNull()
    expect(Object.keys(takenBody.user).sort()).toEqual(Object.keys(freeBody.user).sort())
    expect(takenBody.user).toMatchObject({ email: 'free@example.com', emailVerified: false, name: 'Same Name' })
    // No session on either branch: a missing Set-Cookie on one side would be the oracle.
    expect(free.headers.getSetCookie()).toEqual([])
    expect(taken.headers.getSetCookie()).toEqual([])
    // The taken answer must not carry the existing account's id or its verification state.
    const existing = await prisma.user.findUnique({ where: { email: 'free@example.com' } })
    expect(takenBody.user.id).not.toBe(existing!.id)
  })

  it('an already verified address answers the same as an unverified one', async () => {
    await signUp('verified@example.com')
    await prisma.user.update({ where: { email: 'verified@example.com' }, data: { emailVerified: true } })
    const taken = await signUp('verified@example.com')
    const body = (await taken.json()) as { user: { emailVerified: boolean } }
    expect(taken.status).toBe(200)
    expect(body.user.emailVerified).toBe(false)
    expect(taken.headers.getSetCookie()).toEqual([])
  })

  it('a fresh sign-up creates an account that cannot sign in before the address is verified', async () => {
    await signUp('unverified@example.com')
    const attempt = await signIn('unverified@example.com')
    expect(attempt.status).toBe(403)
    expect(attempt.headers.getSetCookie()).toEqual([])
    expect(((await attempt.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('a wrong password for an unverified account is the same error as for an unknown address', async () => {
    await signUp('someone@example.com')
    const wrong = await signIn('someone@example.com', 'a-completely-wrong-password')
    const unknown = await signIn('nobody@example.com', 'a-completely-wrong-password')
    expect(wrong.status).toBe(unknown.status)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('the verification link marks the address verified; the account then signs in', async () => {
    await signUp('link@example.com')
    const line = mails.find((m) => m.startsWith('verification link for l***@example.com'))!
    expect(line).toBeDefined()
    const link = new URL(line.split(': ')[1]!)
    const verify = await fetch(`${baseUrl}/api/auth/verify-email${link.search}`, { redirect: 'manual' })
    expect(verify.status).toBe(302)
    // No session from the link: whoever clicked it might not be the person who chose the password.
    expect(verify.headers.getSetCookie()).toEqual([])
    const ok = await signIn('link@example.com')
    expect(ok.status).toBe(200)
  })

  it('the owner of a taken address gets a notice mail, a new address gets the verification mail', async () => {
    await signUp('owner@example.com')
    mails.length = 0
    await signUp('owner@example.com')
    expect(mails.filter((m) => m.startsWith('verification link'))).toEqual([])
    expect(mails.some((m) => m.startsWith('account notice for o***@example.com'))).toBe(true)
    // The notice carries no token: it must not be a second way to take the account over.
    expect(mails.join('\n')).not.toMatch(/token=/)
  })

  it('a mail outage does not turn either branch into a different answer', async () => {
    const { LoggingEmailSender } = await import('../../src/auth/logging-email-sender.js')
    const failing = new Error('provider down')
    const verification = vi.spyOn(LoggingEmailSender.prototype, 'sendVerificationEmail').mockRejectedValue(failing)
    const notice = vi.spyOn(LoggingEmailSender.prototype, 'sendExistingAccountNotice').mockRejectedValue(failing)
    try {
      const free = await signUp('outage@example.com')
      const taken = await signUp('outage@example.com')
      expect(free.status).toBe(200)
      expect(taken.status).toBe(200)
    } finally {
      verification.mockRestore()
      notice.mockRestore()
    }
  })

  it('both branches take comparable time (the password is hashed on both)', async () => {
    await signUp('timing@example.com')
    const time = async (email: string) => {
      const start = performance.now()
      await signUp(email)
      return performance.now() - start
    }
    const taken = Math.min(await time('timing@example.com'), await time('timing@example.com'))
    const free = Math.min(await time('timing-a@example.com'), await time('timing-b@example.com'))
    // Hashing is the dominant cost; a skipped hash would put the taken branch an order of magnitude under.
    expect(taken).toBeGreaterThan(free * 0.4)
  })
})
