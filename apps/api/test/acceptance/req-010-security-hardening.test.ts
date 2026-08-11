// REQ-010 — login/API security hardening (ADR-0012 §5). Real Postgres, real HTTP
// against the actual `buildApp()` boot (never `.inject()`) — headers, CORS/CSRF and
// rate-limit enforcement are all things a real listening socket proves that
// `.inject()` structurally cannot.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-010-secret'
process.env.BETTER_AUTH_SECRET = 'req-010-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39997'
process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'

describe('REQ-010 — security hardening, against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('any API response carries helmet-set security headers and a CSP disallowing inline/unsafe script', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`)
    expect(response.status).toBe(200)

    const csp = response.headers.get('content-security-policy')
    expect(csp).toBeTruthy()
    // Only script-src is asserted strict — helmet's default CSP legitimately allows
    // 'unsafe-inline' on style-src (low-risk CSS injection), which REQ-010 doesn't
    // ask us to change; the acceptance criterion is specifically "disallowing
    // inline/unsafe script".
    const scriptSrc = csp!.split(';').find((directive) => directive.trim().startsWith('script-src '))
    expect(scriptSrc).toBe("script-src 'self'")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBeTruthy()
  })

  it('the /docs Swagger route is exempted from the CSP so it still renders', async () => {
    const response = await fetch(`${baseUrl}/docs`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBeNull()
    const body = await response.text()
    expect(body).toContain('Swagger UI')
  })

  it('a state-changing auth request from a non-trusted origin is rejected (origin-based CSRF)', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://not-trusted.example.com' },
      body: JSON.stringify({ email: 'csrf-blocked@example.com', password: 'a-fine-strong-password-1', name: 'CSRF' }),
    })
    expect(response.status).toBe(403)

    const user = await prisma.user.findUnique({ where: { email: 'csrf-blocked@example.com' } })
    expect(user).toBeNull()
  })

  it('the same request from the allow-listed CORS origin (the single shared trustedOrigins source) succeeds', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
      body: JSON.stringify({ email: 'csrf-allowed@example.com', password: 'a-fine-strong-password-1', name: 'CSRF OK' }),
    })
    expect(response.status).toBe(200)
  })

  // #248 — the test this replaces sent no `origin` header on either the sign-up or
  // the 12 sign-in attempts. better-auth's own origin-check middleware rejects any
  // request with no `origin` at all with 403 MISSING_OR_NULL_ORIGIN, *before*
  // credential validation ever runs — so the probe account never existed, and the
  // 429 the old assertion found came from better-auth's router-level rate limiter
  // (which counts *every* request to /sign-in*, tripped by the 12 origin-rejected
  // calls) rather than from 12 genuine wrong-password attempts against a real
  // account. `toContain(429)` passed, but not for the reason the test's name claims.
  // Sending a trusted origin (matching CORS_ALLOWED_ORIGINS) on both calls — the
  // same fix `trusted-proxies-ip-resolution.test.ts`'s A1/A2 already use — makes the
  // account genuinely exist and every sign-in attempt reach real credential
  // validation, so the status sequence below is asserted exactly, not merely
  // "contains 429 somewhere" (ADR-0021: "a check states its expectation
  // independently of what it checks").
  it('repeated failed logins from the same account trip the DB-backed rate limit rather than being unbounded', async () => {
    const signUpResponse = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
      body: JSON.stringify({ email: 'rate-limited@example.com', password: 'a-fine-strong-password-1', name: 'Rate Limited' }),
    })
    expect(signUpResponse.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { email: 'rate-limited@example.com' } })
    expect(user).not.toBeNull()

    // better-auth's own built-in special rule for /sign-in* (getDefaultSpecialRules)
    // — window 10s / max 3, not our own config.
    const SIGN_IN_WINDOW_MAX = 3

    const attempts: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
        body: JSON.stringify({ email: 'rate-limited@example.com', password: 'definitely-wrong-password' }),
      })
      attempts.push(response.status)
    }

    // The first SIGN_IN_WINDOW_MAX attempts are genuine failed logins against the
    // real account created above (401 INVALID_EMAIL_OR_PASSWORD); every attempt
    // after that trips the DB-backed limiter (429) instead of reaching credential
    // validation at all.
    expect(attempts).toEqual([...Array(SIGN_IN_WINDOW_MAX).fill(401), ...Array(12 - SIGN_IN_WINDOW_MAX).fill(429)])

    // Proves the counter is actually DB-backed (ADR-0012 §5), not an
    // in-memory-only structure invisible to inspection.
    const rows = await prisma.rateLimit.findMany()
    expect(rows.length).toBeGreaterThan(0)
  })
})
