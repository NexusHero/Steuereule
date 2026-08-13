// resolveClientAddress (#350) — the pure resolution half of the IP-resolution seam.
// A pure function taking peer/headers/policy as parameters, same shape as every
// other resolve*(env) unit test in this codebase (trusted-proxies.test.ts) — no
// server, no DB, no Fastify.
import { describe, expect, it } from 'vitest'
import { resolveClientAddress } from '../src/auth/client-address.js'

describe('resolveClientAddress', () => {
  describe('no trusted proxy configured (TRUSTED_PROXIES unset/`none` — trustedProxies: [])', () => {
    it('returns the socket peer alone', () => {
      expect(resolveClientAddress('203.0.113.9', {}, { trustedProxies: [] })).toBe('203.0.113.9')
    })

    it('OVERWRITES — ignores any inbound x-forwarded-for entirely, never appending it', () => {
      const headers = { 'x-forwarded-for': '198.51.100.1' }
      expect(resolveClientAddress('203.0.113.9', headers, { trustedProxies: [] })).toBe('203.0.113.9')
    })

    it('OVERWRITES — ignores an inbound value under our own header name too (an attacker sending it directly)', () => {
      const headers = { 'x-steuereule-client-address': '198.51.100.1' }
      expect(resolveClientAddress('203.0.113.9', headers, { trustedProxies: [] })).toBe('203.0.113.9')
    })

    it('two distinct peers resolve to two distinct addresses — the per-client property this seam exists for', () => {
      const a = resolveClientAddress('127.0.0.1', {}, { trustedProxies: [] })
      const b = resolveClientAddress('127.0.0.2', {}, { trustedProxies: [] })
      expect(a).not.toBe(b)
    })
  })

  describe('a trusted proxy chain is configured (trustedProxies non-empty)', () => {
    const policy = { trustedProxies: ['10.0.0.0/24'] }

    it('APPENDS the peer to a received chain — the multi-hop path better-auth\'s own right-to-left peel still needs', () => {
      const headers = { 'x-forwarded-for': '198.51.100.1, 203.0.113.50' }
      expect(resolveClientAddress('10.0.0.5', headers, policy)).toBe('198.51.100.1, 203.0.113.50, 10.0.0.5')
    })

    it('with no inbound chain at all, appends to nothing — just the peer', () => {
      expect(resolveClientAddress('10.0.0.5', {}, policy)).toBe('10.0.0.5')
    })

    it('a multi-value inbound header (array form, per Node\'s IncomingHttpHeaders) is joined before appending', () => {
      const headers = { 'x-forwarded-for': ['198.51.100.1', '203.0.113.50'] }
      expect(resolveClientAddress('10.0.0.5', headers, policy)).toBe('198.51.100.1, 203.0.113.50, 10.0.0.5')
    })
  })

  describe('no peer at all (defensive — should not happen behind a real socket)', () => {
    it('returns null so the caller can remove any stale stamp rather than write one that lies', () => {
      expect(resolveClientAddress(null, {}, { trustedProxies: [] })).toBeNull()
      expect(resolveClientAddress(undefined, {}, { trustedProxies: [] })).toBeNull()
      expect(resolveClientAddress('', {}, { trustedProxies: [] })).toBeNull()
    })
  })
})
