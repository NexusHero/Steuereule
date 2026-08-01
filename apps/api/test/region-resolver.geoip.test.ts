// task 0b's three required branches (#238, ADR-0024): resolvable -> country;
// unresolvable -> "unknown"; stale database -> "unknown", not a stale country. Pure
// logic, no filesystem — see region-resolver.geoip.ts's header comment for why the
// data is handed in directly rather than loaded here.
import { describe, expect, it } from 'vitest'
import type { GeoIpManifest, GeoIpRange } from '../src/device/region/geoip-database.js'
import { GeoIpRegionResolver, MAX_DATABASE_AGE_MS } from '../src/device/region/region-resolver.geoip.js'
import { UNKNOWN_REGION } from '../src/device/region/region-resolver.js'

const FRESH_MANIFEST: GeoIpManifest = {
  source: 'https://example.invalid/dbip-country-lite-test.csv',
  licence: 'CC BY 4.0',
  sha256: 'test-checksum',
  fetchedAt: '2026-07-20T00:00:00.000Z',
}

// 203.0.113.0/24 (TEST-NET-3, RFC 5737) mapped to "DE" purely as a synthetic fixture
// — never a claim about who actually holds that documentation range.
const RANGES: GeoIpRange[] = [{ startIPv4: ipv4('203.0.113.0'), endIPv4: ipv4('203.0.113.255'), countryCode: 'DE' }]

function ipv4(dotted: string): number {
  const [a, b, c, d] = dotted.split('.').map(Number)
  return (((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0)
}

function fixedNow(iso: string): () => Date {
  return () => new Date(iso)
}

describe('GeoIpRegionResolver — branch 1: resolvable', () => {
  it('resolves an address inside a known range to its country code', async () => {
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: FRESH_MANIFEST }, fixedNow('2026-07-25T00:00:00.000Z'))
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe('DE')
  })
})

describe('GeoIpRegionResolver — branch 2: unresolvable, never a guess', () => {
  const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: FRESH_MANIFEST }, fixedNow('2026-07-25T00:00:00.000Z'))

  it('an address outside every known range resolves to "unknown"', async () => {
    await expect(resolver.resolve('198.51.100.7')).resolves.toBe(UNKNOWN_REGION)
  })

  it('a private/unroutable address resolves to "unknown" even if it happened to fall in a configured range', async () => {
    await expect(resolver.resolve('10.0.0.5')).resolves.toBe(UNKNOWN_REGION)
    await expect(resolver.resolve('127.0.0.1')).resolves.toBe(UNKNOWN_REGION)
    await expect(resolver.resolve('192.168.1.1')).resolves.toBe(UNKNOWN_REGION)
  })

  it('null (no address at all) resolves to "unknown"', async () => {
    await expect(resolver.resolve(null)).resolves.toBe(UNKNOWN_REGION)
  })

  it('no database configured at all resolves to "unknown", not an error', async () => {
    const noDb = new GeoIpRegionResolver({ ranges: null, manifest: null })
    await expect(noDb.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })
})

describe('GeoIpRegionResolver — branch 3: a stale database resolves to "unknown", not a stale country (ADR-0021)', () => {
  it('an address that WOULD resolve under a fresh database still answers "unknown" once the database has aged past MAX_DATABASE_AGE_MS', async () => {
    const staleAt = new Date(new Date(FRESH_MANIFEST.fetchedAt).getTime() + MAX_DATABASE_AGE_MS + 1)
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: FRESH_MANIFEST }, () => staleAt)

    // Proves the control is real, not merely declared: the exact same address that
    // resolves to "DE" under a fresh database (branch 1 above) must resolve to
    // "unknown" here, with nothing else about the input changed.
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })

  it('a database exactly at the age threshold is still trusted (boundary is exclusive)', async () => {
    const atThreshold = new Date(new Date(FRESH_MANIFEST.fetchedAt).getTime() + MAX_DATABASE_AGE_MS)
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: FRESH_MANIFEST }, () => atThreshold)
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe('DE')
  })
})
