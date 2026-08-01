import { describe, expect, it } from 'vitest'
import { lookupCountry, parseGeoIpCsv, type GeoIpRange } from '../src/device/region/geoip-database.js'
import { parseIPv4 } from '../src/device/region/ip-address.js'

describe('parseGeoIpCsv', () => {
  it('parses well-formed rows into ranges', () => {
    const csv = '1.0.0.0,1.0.0.255,AU\n8.8.8.0,8.8.8.255,US\n'
    const ranges = parseGeoIpCsv(csv)
    expect(ranges).toEqual([
      { startIPv4: parseIPv4('1.0.0.0'), endIPv4: parseIPv4('1.0.0.255'), countryCode: 'AU' },
      { startIPv4: parseIPv4('8.8.8.0'), endIPv4: parseIPv4('8.8.8.255'), countryCode: 'US' },
    ])
  })

  it('uppercases the country code', () => {
    expect(parseGeoIpCsv('1.0.0.0,1.0.0.255,de\n')[0]!.countryCode).toBe('DE')
  })

  it('skips a malformed row rather than failing the whole file', () => {
    const csv = '1.0.0.0,1.0.0.255,AU\nnot,a,valid,row\n8.8.8.0,8.8.8.255,US\n\n'
    const ranges = parseGeoIpCsv(csv)
    expect(ranges).toHaveLength(2)
    expect(ranges.map((r) => r.countryCode)).toEqual(['AU', 'US'])
  })

  it('returns an empty list for an empty file', () => {
    expect(parseGeoIpCsv('')).toEqual([])
  })
})

describe('lookupCountry (binary search over sorted ranges)', () => {
  const ranges: GeoIpRange[] = [
    { startIPv4: parseIPv4('1.0.0.0')!, endIPv4: parseIPv4('1.0.0.255')!, countryCode: 'AU' },
    { startIPv4: parseIPv4('8.8.8.0')!, endIPv4: parseIPv4('8.8.8.255')!, countryCode: 'US' },
    { startIPv4: parseIPv4('203.0.113.0')!, endIPv4: parseIPv4('203.0.113.255')!, countryCode: 'DE' },
  ]

  it('finds the range containing the address, first/middle/last range alike', () => {
    expect(lookupCountry(ranges, parseIPv4('1.0.0.42')!)).toBe('AU')
    expect(lookupCountry(ranges, parseIPv4('8.8.8.8')!)).toBe('US')
    expect(lookupCountry(ranges, parseIPv4('203.0.113.99')!)).toBe('DE')
  })

  it('matches the exact boundary addresses of a range', () => {
    expect(lookupCountry(ranges, parseIPv4('8.8.8.0')!)).toBe('US')
    expect(lookupCountry(ranges, parseIPv4('8.8.8.255')!)).toBe('US')
  })

  it('returns null for an address in a gap between ranges', () => {
    expect(lookupCountry(ranges, parseIPv4('9.9.9.9')!)).toBeNull()
  })

  it('returns null for an empty range list', () => {
    expect(lookupCountry([], parseIPv4('8.8.8.8')!)).toBeNull()
  })
})
