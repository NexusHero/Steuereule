// login-rate-limit.ts's pure half (#248/#292 — REQ-010's account-keyed sign-in
// limiter). No DB, no server — just the key-derivation function, the same idiom as
// trusted-proxies.test.ts's split between its pure resolver tests and its own
// acceptance-tier siblings. The hook itself (createLoginRateLimitHook) needs a real
// better-auth dispatch + Postgres to exercise meaningfully — that's
// trusted-proxies-ip-resolution.test.ts's "#248" describe block and
// req-010-security-hardening.test.ts, both acceptance tier.
import { describe, expect, it } from 'vitest'
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, loginRateLimitKey } from '../src/auth/login-rate-limit.js'

describe('loginRateLimitKey', () => {
  it('is stable for the same email', () => {
    expect(loginRateLimitKey('someone@example.com')).toBe(loginRateLimitKey('someone@example.com'))
  })

  it('normalizes case — an attacker cannot buy a fresh bucket by varying letter case', () => {
    expect(loginRateLimitKey('Someone@Example.com')).toBe(loginRateLimitKey('someone@example.com'))
  })

  it('normalizes surrounding whitespace', () => {
    expect(loginRateLimitKey('  someone@example.com  ')).toBe(loginRateLimitKey('someone@example.com'))
  })

  it('differs for genuinely different accounts', () => {
    expect(loginRateLimitKey('alice@example.com')).not.toBe(loginRateLimitKey('bob@example.com'))
  })

  it('carries a fixed, recognisable prefix — never collides with better-auth’s own "${ip}|${path}" key shape', () => {
    expect(loginRateLimitKey('someone@example.com')).toBe('login-attempts|someone@example.com')
  })
})

describe('the configured threshold', () => {
  it('is looser than better-auth’s own IP-keyed special rule for /sign-in* (10s/max 3) — a deliberate choice, not an oversight (see login-rate-limit.ts’s own header comment)', () => {
    expect(LOGIN_RATE_LIMIT_MAX).toBeGreaterThan(3)
    expect(LOGIN_RATE_LIMIT_WINDOW_MS).toBeGreaterThan(10_000)
  })
})
