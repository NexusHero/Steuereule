// login-rate-limit.ts's pure half (#248/#292 — REQ-010's account-keyed sign-in
// limiter). No DB, no server — just the key-derivation function, the same idiom as
// trusted-proxies.test.ts's split between its pure resolver tests and its own
// acceptance-tier siblings. The hooks themselves (createLoginRateLimitBeforeHook /
// createLoginRateLimitAfterHook) need a real better-auth dispatch + Postgres to
// exercise meaningfully — that's trusted-proxies-ip-resolution.test.ts's account-keyed
// describe block and req-010-security-hardening.test.ts, both acceptance tier.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, loginRateLimitKey } from '../src/auth/login-rate-limit.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

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

  it('carries a fixed, recognisable prefix and a sha256-hex digest of the normalized email — never collides with better-auth’s own "${ip}|${path}" key shape', () => {
    expect(loginRateLimitKey('someone@example.com')).toBe(`login-attempts|${sha256Hex('someone@example.com')}`)
  })

  // Musti's review, PR #339, blocking finding 2: `ctx.body?.email` used to be taken
  // raw — a 5000-char non-email string produced a 5015-char `RateLimit.key` row on an
  // unindexed, unpruned table, before the endpoint's own zod schema ever got a chance
  // to reject the request. Hashing removes the size dimension: this must hold
  // regardless of how long or malformed the input is.
  it('is a fixed length — 15-char prefix + 64 hex chars — no matter how long the (attacker-controlled) input is', () => {
    const fixedLength = 'login-attempts|'.length + 64
    expect(loginRateLimitKey('a@b.co')).toHaveLength(fixedLength)
    expect(loginRateLimitKey(`${'a'.repeat(5000)}@example.com`)).toHaveLength(fixedLength)
    expect(loginRateLimitKey('x'.repeat(5000))).toHaveLength(fixedLength) // junk, not even email-shaped
  })
})

describe('the configured threshold', () => {
  it('is looser than better-auth’s own IP-keyed special rule for /sign-in* (10s/max 3) — a deliberate choice, not an oversight (see login-rate-limit.ts’s own header comment)', () => {
    expect(LOGIN_RATE_LIMIT_MAX).toBeGreaterThan(3)
    expect(LOGIN_RATE_LIMIT_WINDOW_MS).toBeGreaterThan(10_000)
  })
})
