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

  // #350 (Musti's finding): this test used to be named "from the same account", as
  // if the account being targeted were what the assertion depended on — but it
  // never was. better-auth's built-in limiter has no account dimension at all; it
  // keys purely on `${resolvedIp}|${path}` (createRateLimitKey,
  // better-auth/dist/api/rate-limiter/index.mjs). A version of this test hitting 12
  // DIFFERENT accounts from this same `fetch()` caller would trip the identical
  // 429 at the identical attempt — the name just happened not to say so. Rather
  // than leave that unstated, the second test below makes it the explicit
  // assertion: same caller, 12 different accounts, same result. This one keeps its
  // original shape (one account, repeated) but is renamed to describe what it
  // actually proves, and now asserts the literal key too — which the second test's
  // comparison depends on.
  it('repeated failed sign-in attempts trip the DB-backed rate limit, keyed by caller+path — not by account identity', async () => {
    await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rate-limited@example.com', password: 'a-fine-strong-password-1', name: 'Rate Limited' }),
    })

    const attempts: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'rate-limited@example.com', password: 'definitely-wrong-password' }),
      })
      attempts.push(response.status)
    }

    expect(attempts).toContain(429)
    // Proves the counter is actually DB-backed (ADR-0012 §5), not an
    // in-memory-only structure invisible to inspection.
    const rows = await prisma.rateLimit.findMany()
    expect(rows.length).toBeGreaterThan(0)
    // The caller dimension, stated directly (#350): the persisted key names the
    // resolved caller and the path — `rate-limited@example.com` appears nowhere in
    // it. This is what the discriminator test right below relies on to prove the
    // account identity played no part at all.
    const signInRow = rows.find((r) => r.key?.endsWith('|/sign-in/email'))
    expect(signInRow?.key).toBe('127.0.0.1|/sign-in/email')
  })

  // The discriminator #350 asked for directly: this test's own account list is the
  // twelve-different-accounts case the test above's old name could not distinguish
  // itself from. Same real caller (this test process's own loopback peer), a fresh
  // email on every attempt — and it STILL trips 429 at the same point, because the
  // bucket was never scoped to the account at all. Green here is not "the account
  // control works" (there is no account control in this limiter); it is "the
  // caller+path scoping the seam gives every better-auth ceiling holds even when an
  // attacker never reuses a target account".
  it('twelve DIFFERENT accounts from the same caller trip the identical bucket — proving there is no account dimension to this limiter', async () => {
    const attempts: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const email = `rate-limited-discriminator-${i}@example.com`
      await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Discriminator' }),
      })
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'definitely-wrong-password' }),
      })
      attempts.push(response.status)
    }

    expect(attempts).toContain(429)
    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: '/sign-in/email' } } })
    // The same literal key as the single-account test above — the row is shared
    // across every one of the twelve distinct accounts, not one row per account.
    expect(row?.key).toBe('127.0.0.1|/sign-in/email')
  })
})
