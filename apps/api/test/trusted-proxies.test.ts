// resolveTrustedProxies (#241) — A4 from Musti's review: "Produktion ohne
// TRUSTED_PROXIES -> Boot wirft; none -> bootet; ungültiger Eintrag -> abgelehnt."
// A pure function taking `env` as a parameter, same shape as every other resolve*(env)
// test in this codebase (resolveBetterAuthSecret/resolveBetterAuthUrl in
// better-auth.test.ts) — no server, no DB needed.
import proxyaddr from '@fastify/proxy-addr'
import type { IncomingMessage } from 'node:http'
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

  // The breadth floor (#241, Musti's review) — a trusted range broad enough to cover
  // the socket peer makes Fastify's `@fastify/proxy-addr` return the attacker-controlled
  // leftmost `X-Forwarded-For` value (fail-open): `trustProxy: ['0.0.0.0/1']`, peer
  // `127.0.0.1`, XFF `203.0.113.66, 127.0.0.1` → `203.0.113.66`. `/0` and `/1` are the
  // two lengths that fail open; `/2` and narrower leave the loopback peer outside the
  // trusted set and fail closed instead. The guard lives here, once, so both better-auth
  // and Fastify consume a value that is safe for both.
  it('rejects an overly broad range (/0 or /1) that would make Fastify fail open on a spoofed leftmost value', () => {
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '0.0.0.0/0' })).toThrow(/overly broad entries: 0\.0\.0\.0\/0/)
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '0.0.0.0/1' })).toThrow(/overly broad entries: 0\.0\.0\.0\/1/)
    expect(() => resolveTrustedProxies({ TRUSTED_PROXIES: '::/1' })).toThrow(/overly broad entries: ::\/1/)
  })

  it('accepts a /2 range — the first length narrow enough to keep the socket peer outside the trusted set', () => {
    expect(resolveTrustedProxies({ TRUSTED_PROXIES: '0.0.0.0/2' })).toEqual(['0.0.0.0/2'])
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

// The breadth floor's reason, re-proven against the real resolver instead of re-stated as a
// comment. Until Ticket 02 the `/1`-vs-`/2` fail-open boundary was only documented as
// "measured against @fastify/proxy-addr@5.1.0" (`trusted-proxies.ts`); this pins that
// measurement as a re-executed test against the exact library Fastify's `trustProxy` runs,
// so a proxy-addr upgrade that shifts the boundary turns this red instead of silently
// invalidating `MIN_TRUSTED_PROXY_PREFIX_LENGTH`. The full-adapter integration test (real
// `FastifyAdapter` + spoofed XFF) is follow-up work — Ticket 13.
describe('@fastify/proxy-addr fail-open threshold — why the breadth guard floors at /2', () => {
  // A minimal request carrying only what `@fastify/forwarded` (which proxy-addr reads)
  // actually touches: the `X-Forwarded-For` header and the socket peer address.
  function requestWith(xff: string | undefined, remoteAddress: string): IncomingMessage {
    return {
      headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
      socket: { remoteAddress },
    } as unknown as IncomingMessage
  }

  it('/1 covers the socket peer, so proxy-addr returns the attacker-controlled leftmost XFF value (fail-open)', () => {
    expect(proxyaddr(requestWith('203.0.113.66, 127.0.0.1', '127.0.0.1'), ['0.0.0.0/1'])).toBe('203.0.113.66')
  })

  it('/2 leaves the socket peer outside the trusted set, so proxy-addr returns the peer itself (fail-closed)', () => {
    expect(proxyaddr(requestWith('203.0.113.66, 127.0.0.1', '127.0.0.1'), ['0.0.0.0/2'])).toBe('127.0.0.1')
  })
})
