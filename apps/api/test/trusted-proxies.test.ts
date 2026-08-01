// resolveTrustedProxies (#241) — A4 from Musti's review: "Produktion ohne
// TRUSTED_PROXIES -> Boot wirft; none -> bootet; ungültiger Eintrag -> abgelehnt."
// A pure function taking `env` as a parameter, same shape as every other resolve*(env)
// test in this codebase (resolveBetterAuthSecret/resolveBetterAuthUrl in
// better-auth.test.ts) — no server, no DB needed.
import { describe, expect, it } from 'vitest'
import { resolveTrustedProxies } from '../src/config/trusted-proxies.js'

describe('resolveTrustedProxies', () => {
  it('resolves to an empty list when unset outside production — matches today’s actual, unchanged runtime posture', () => {
    expect(resolveTrustedProxies({ NODE_ENV: 'test' })).toEqual([])
    expect(resolveTrustedProxies({})).toEqual([])
  })

  it('A4: throws in production when TRUSTED_PROXIES is unset — the degraded state (a shared bucket) is invisible otherwise', () => {
    expect(() => resolveTrustedProxies({ NODE_ENV: 'production' })).toThrow(/TRUSTED_PROXIES must be set in production/)
  })

  it('A4: TRUSTED_PROXIES=none is a valid, explicit choice — resolves to empty and boots in production', () => {
    expect(resolveTrustedProxies({ NODE_ENV: 'production', TRUSTED_PROXIES: 'none' })).toEqual([])
    expect(resolveTrustedProxies({ NODE_ENV: 'test', TRUSTED_PROXIES: 'none' })).toEqual([])
  })

  it('parses a single configured CIDR range', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '10.0.0.0/24' })).toEqual(['10.0.0.0/24'])
  })

  it('parses a comma-separated list, trimming whitespace, same idiom as resolveCorsOrigins', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '10.0.0.0/24, 192.168.1.1 , 2001:db8::/32' })).toEqual([
      '10.0.0.0/24',
      '192.168.1.1',
      '2001:db8::/32',
    ])
  })

  it('accepts a bare IPv4/IPv6 address with no prefix (an exact host, not a range)', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '203.0.113.1' })).toEqual(['203.0.113.1'])
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '::1' })).toEqual(['::1'])
  })

  it('A4: rejects an invalid entry outright, in every environment — a malformed value fails loud rather than warning quietly', () => {
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: 'not-an-ip' })).toThrow(/invalid entries: not-an-ip/)
    expect(() => resolveTrustedProxies({ NODE_ENV: 'production', TRUSTED_PROXIES: '10.0.0.0/24, garbage' })).toThrow(
      /invalid entries: garbage/,
    )
  })

  it('rejects a CIDR prefix outside the address family’s valid range', () => {
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '10.0.0.0/33' })).toThrow(/invalid entries: 10\.0\.0\.0\/33/)
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '::1/129' })).toThrow(/invalid entries: ::1\/129/)
  })

  // Musti's review explicitly did NOT prescribe a floor on how broad a prefix may be
  // (e.g. rejecting 0.0.0.0/0) — @fastify/proxy-addr already throws on that itself for
  // its own consumer, and a guard added here "on suspicion" without a failing case to
  // justify it is exactly the kind of unproven control this project has spent a whole
  // day removing elsewhere. This test records that choice as deliberate, not an
  // oversight: it stays green precisely because no floor was added.
  it('does not reject an overly broad range on its own — that guard belongs to whichever consumer actually needs it, proven by a failing case first', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '0.0.0.0/0' })).toEqual(['0.0.0.0/0'])
  })
})
