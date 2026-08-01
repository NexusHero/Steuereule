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

  // No floor on prefix breadth is built here (#241, Musti's review). Measured, not
  // assumed: @fastify/proxy-addr@5.1.0 throws only on the *exact* range `0.0.0.0/0`;
  // `0.0.0.0/1`/`::/1` pass through it silently and return the attacker-controlled
  // leftmost value, while `/2`/`/8` were harmless in the one setup measured so far.
  // That failure mode belongs to proxy-addr/Fastify's `trustProxy`, which this ticket
  // does not wire (#238's own follow-up, consuming this resolver's output) —
  // better-auth's own algorithm, the only consumer wired here, fails the *opposite*
  // direction on an overly-broad range (converges toward `null`, not an
  // attacker-chosen value), so there is no failing case against THIS ticket's actual
  // consumer to justify a guard here yet. This test records that as a deliberate,
  // named deferral to #238 — not an oversight, and not "Musti checked this and it's
  // fine everywhere" (an earlier draft of this comment said exactly that, incorrectly
  // generalising a narrower, explicitly-scoped measurement; corrected here).
  it('does not reject an overly broad range on its own — that guard belongs to #238’s Fastify/proxy-addr consumer, proven by a failing case there first', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '0.0.0.0/1' })).toEqual(['0.0.0.0/1'])
  })
})

describe('resolveTrustedProxies — F1 regression: node:net’s isIP, not a hand-rolled regex', () => {
  // Musti's review measured the earlier hand-rolled `ipFamily` regex against
  // `node:net`'s own `isIP` and found it wrong in both directions on 6 of 9 samples —
  // the security-relevant direction is the false negative: this resolver exists
  // specifically to fail loud on an unparseable entry (unlike better-auth's own
  // findInvalidTrustedProxies, which only warns), so a valid entry this resolver
  // wrongly rejects is a boot-abort an operator did nothing to deserve, and a value
  // this resolver wrongly *accepts* as a hop to trust, that better-auth's own (more
  // lenient) parser then silently drops, leaves the operator believing a hop is
  // trusted when it is not — exactly the gap this resolver was built to prevent.
  it('rejects garbage that a permissive regex could mistake for IPv6', () => {
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '::::' })).toThrow(/invalid entries: ::::/)
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '1:2:3' })).toThrow(/invalid entries: 1:2:3/)
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '2001:db8::1::2' })).toThrow(/invalid entries: 2001:db8::1::2/)
  })

  it('accepts a real IPv4-mapped IPv6 address — better-auth’s own ip.mjs handles this shape explicitly (extractIPv4FromMapped)', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '::ffff:1.2.3.4' })).toEqual(['::ffff:1.2.3.4'])
  })
})
