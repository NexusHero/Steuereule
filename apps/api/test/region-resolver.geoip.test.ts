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

  // Musti's #239 F1: `new Date(unparsable).getTime()` is `NaN`, and every comparison
  // against `NaN` (including `ageMs > MAX_DATABASE_AGE_MS`) is `false` — a bare `>`
  // check on `ageMs` therefore falls THROUGH to the lookup instead of forcing
  // `unknown`. `loadGeoIpManifest`'s `JSON.parse(...) as GeoIpManifest` never
  // validates the manifest it reads from disk, so a truncated or malformed file
  // (a broken fetch, most plausibly) reaches this resolver as-is. ADR-0021: proven
  // both directions — an unparsable `fetchedAt` must force `unknown`, and repairing
  // it must resolve the country again, or the branch could be a no-op that always
  // answers `unknown` regardless of what it inspects.
  it.each([
    ['not-a-date', 'a non-date string'],
    ['', 'an empty string'],
    ['2026-13-45', 'an out-of-range calendar date'],
  ])('an unparsable fetchedAt (%s — %s) resolves to "unknown", never a guess from a database of unknown age', async (fetchedAt) => {
    const manifest: GeoIpManifest = { ...FRESH_MANIFEST, fetchedAt }
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest }, fixedNow('2026-07-25T00:00:00.000Z'))
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })

  it('a manifest missing fetchedAt entirely resolves to "unknown" — same NaN path as an unparsable value', async () => {
    // `loadGeoIpManifest`'s bare `JSON.parse(...) as GeoIpManifest` cast means a
    // truncated write can drop the field outright, not just corrupt its value —
    // `GeoIpManifest['fetchedAt']` is typed as a required `string`, so this
    // constructs the runtime shape the cast would let through, deliberately outside
    // that type.
    const { fetchedAt: _omitted, ...rest } = FRESH_MANIFEST
    const manifest = rest as GeoIpManifest
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest }, fixedNow('2026-07-25T00:00:00.000Z'))
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })

  it('repairing an unparsable fetchedAt back to a real, fresh timestamp resolves the country again', async () => {
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: FRESH_MANIFEST }, fixedNow('2026-07-25T00:00:00.000Z'))
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe('DE')
  })

  // Same "only one direction checked" shape as the NaN case above — a future
  // `fetchedAt` (clock skew, a corrupted manifest) yields a negative `ageMs`, which
  // is also `< MAX_DATABASE_AGE_MS` and would otherwise be trusted as "fresh".
  it('a fetchedAt in the future resolves to "unknown" — not evidence of freshness', async () => {
    const future: GeoIpManifest = { ...FRESH_MANIFEST, fetchedAt: '2026-08-01T00:00:00.000Z' }
    const resolver = new GeoIpRegionResolver({ ranges: RANGES, manifest: future }, fixedNow('2026-07-25T00:00:00.000Z'))
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })
})
