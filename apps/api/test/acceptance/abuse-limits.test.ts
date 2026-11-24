// ADR-0106 D8/D9 — limits that hold whatever address a caller uses. Real Postgres, real HTTP against
// `buildApp()`. Loopback is the trusted proxy here, so each request can carry its own client address in
// X-Forwarded-For: the per-address limit then never trips, and what is left to measure is the limit under test.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ORIGIN = 'https://allowed.example.com'

describe('limits independent of the caller address (ADR-0106 D8/D9)', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'abuse-limits-secret',
      BETTER_AUTH_SECRET: 'abuse-limits-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39984',
      CORS_ALLOWED_ORIGINS: ORIGIN,
      TRUSTED_PROXIES: '127.0.0.1',
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
      await prisma.profile.deleteMany()
    },
  })

  it('D9: the eleventh sign-in attempt on one account within 15 minutes is refused, from any address', async () => {
    // Sign-up without the helper's own sign-in, which would use one of the account's ten attempts.
    await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: 'abuse-limit-account@example.com', password: 'a-fine-strong-password-1', name: 'Abuse' }),
    })
    const statuses: number[] = []
    const codes: (string | undefined)[] = []
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': `203.0.113.${i + 10}` },
        body: JSON.stringify({ email: 'abuse-limit-account@example.com', password: `wrong-password-${i}` }),
      })
      statuses.push(response.status)
      codes.push(((await response.json()) as { code?: string }).code)
    }
    expect(statuses).toEqual([...Array<number>(10).fill(401), 429])
    expect(codes.at(-1)).toBe('SIGN_IN_ATTEMPTS_EXCEEDED')

    // Another account is not affected.
    await signUp('abuse-limit-other@example.com')
    const other = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.99' },
      body: JSON.stringify({ email: 'abuse-limit-other@example.com', password: 'a-fine-strong-password-1' }),
    })
    expect(other.status).toBe(200)
  })

  it('ADR-0108: the eleventh /verify-password on one account within 15 minutes is refused, from any address', async () => {
    const { cookie } = await signUp('verify-pw-abuse@example.com')
    let lastStatus = 0
    let lastCode: string | undefined
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, cookie, 'x-forwarded-for': `203.0.113.${i + 40}` },
        body: JSON.stringify({ password: `wrong-password-${i}` }),
      })
      lastStatus = response.status
      lastCode = ((await response.json()) as { code?: string }).code
    }
    // The per-address limit never trips (each attempt comes from a fresh forwarded address); the per-account
    // limit does, before the password is even checked — closing the password oracle (ADR-0106 D9 review).
    expect(lastStatus).toBe(429)
    expect(lastCode).toBe('VERIFY_PASSWORD_ATTEMPTS_EXCEEDED')
  })

  // Review of ADR-0108: /change-password checks the current password just like /verify-password, and a right
  // guess there takes the account over. Limiting one path alone left the oracle open on the other.
  it('ADR-0108: /change-password shares the per-account budget, so the oracle is not open next door', async () => {
    const { cookie } = await signUp('change-pw-abuse@example.com')
    const guess = (path: string, body: object, i: number) =>
      fetch(`${baseUrl}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, cookie, 'x-forwarded-for': `203.0.113.${i + 80}` },
        body: JSON.stringify(body),
      })
    const statuses: number[] = []
    for (let i = 0; i < 5; i += 1) statuses.push((await guess('/verify-password', { password: `wrong-password-${i}` }, i)).status)
    for (let i = 5; i < 10; i += 1) {
      statuses.push((await guess('/change-password', { currentPassword: `wrong-password-${i}`, newPassword: 'another-fine-password-2' }, i)).status)
    }
    expect(statuses.filter((status) => status === 429)).toEqual([])

    // The eleventh attempt is refused on either path, even with the right password.
    const eleventh = await guess('/change-password', { currentPassword: 'a-fine-strong-password-1', newPassword: 'another-fine-password-2' }, 10)
    expect(eleventh.status).toBe(429)
    expect(((await eleventh.json()) as { code?: string }).code).toBe('VERIFY_PASSWORD_ATTEMPTS_EXCEEDED')
    expect((await guess('/verify-password', { password: 'a-fine-strong-password-1' }, 11)).status).toBe(429)
  })

  it('D8: guests from one address may write 300 times an hour, the next write is refused', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 301; i += 1) {
      const response = await fetch(`${baseUrl}/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '198.51.100.20' },
        body: JSON.stringify({ firstName: `Gast${i}`, lastName: 'G' }),
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 300).every((status) => status === 200)).toBe(true)
    expect(statuses[300]).toBe(429)

    // Another address is not affected.
    const elsewhere = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '198.51.100.21' },
      body: JSON.stringify({ firstName: 'Gast', lastName: 'G' }),
    })
    expect(elsewhere.status).toBe(200)
  })
})
