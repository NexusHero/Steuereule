// REQ-010 — login/API security hardening (ADR-0012 §5). Real Postgres, real HTTP
// against the actual `buildApp()` boot (never `.inject()`) — headers, CORS/CSRF and
// rate-limit enforcement are all things a real listening socket proves that
// `.inject()` structurally cannot.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, useAcceptanceServer } from '../support/acceptance-server.js'

describe('REQ-010 — security hardening, against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-010-secret',
      BETTER_AUTH_SECRET: 'req-010-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39997',
      CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
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

  // ADR-0103 vulnerability 1 — the origin check now extends to the app's own `/v1` controllers, which
  // better-auth's own check (it guards only `/api/auth/*`) never reached. The session cookie is
  // SameSite=None (ADR-0011), so without this a cross-site form POST would arrive with the victim's cookie.
  it('a state-changing /v1 request from a non-trusted origin is rejected (origin-based CSRF on the app routes)', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://not-trusted.example.com' },
      body: JSON.stringify({ firstName: 'Mallory', lastName: 'Attacker', steuerId: '02476291358' }),
    })
    expect(response.status).toBe(403)
  })

  it('the same /v1 request from the allow-listed origin is not CSRF-blocked (the real web app still works)', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.com' },
      body: JSON.stringify({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358' }),
    })
    expect(response.status).toBe(200)
  })

  it('a state-changing /v1 request with no Origin header is allowed (a native app / server-to-server client, not browser CSRF)', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Nat', lastName: 'Ive', steuerId: '02476291358' }),
    })
    expect(response.status).toBe(200)
  })

  it('repeated failed logins from the same account trip better-auth\'s built-in rate limit rather than being unbounded', async () => {
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
  })
})
