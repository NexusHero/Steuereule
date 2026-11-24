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
