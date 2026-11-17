import { describe, expect, it } from 'vitest'
import { isPrivateOrUnroutableIPv4, isPrivateOrUnroutableIPv6, parseIPv4 } from '../src/device/region/ip-address.js'

describe('parseIPv4', () => {
  it('parses a plain dotted-quad address', () => {
    expect(parseIPv4('203.0.113.42')).toBe((((203 << 24) | (0 << 16) | (113 << 8) | 42) >>> 0))
  })

  it('unwraps an IPv4-mapped IPv6 address', () => {
    expect(parseIPv4('::ffff:203.0.113.42')).toBe(parseIPv4('203.0.113.42'))
  })

  it('returns null for a bare IPv6 address', () => {
    expect(parseIPv4('2001:db8::1')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(parseIPv4('not-an-ip')).toBeNull()
    expect(parseIPv4('999.0.0.1')).toBeNull()
    expect(parseIPv4('1.2.3')).toBeNull()
  })
})

describe('isPrivateOrUnroutableIPv4', () => {
  const cases: Array<[string, boolean]> = [
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false], // just outside the RFC 1918 172.16/12 block
    ['192.168.1.1', true],
    ['127.0.0.1', true],
    ['169.254.1.1', true],
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.1', true],
    ['203.0.113.42', false],
    ['8.8.8.8', false],
    // Every edge of every range (Sonar S1313 refactor: the table must keep these exactly).
    ['0.255.255.255', true],
    ['1.0.0.0', false],
    ['9.255.255.255', false],
    ['10.255.255.255', true],
    ['11.0.0.0', false],
    ['100.63.255.255', false],
    ['100.127.255.255', true],
    ['100.128.0.0', false],
    ['126.255.255.255', false],
    ['127.255.255.255', true],
    ['128.0.0.0', false],
    ['169.253.255.255', false],
    ['169.254.255.255', true],
    ['169.255.0.0', false],
    ['172.15.255.255', false],
    ['192.167.255.255', false],
    ['192.168.255.255', true],
    ['192.169.0.0', false],
    ['223.255.255.255', false],
    ['224.0.0.0', true],
    ['239.255.255.255', true],
    ['255.255.255.255', false],
  ]

  it.each(cases)('%s -> unroutable=%s', (ip, expected) => {
    expect(isPrivateOrUnroutableIPv4(parseIPv4(ip)!)).toBe(expected)
  })
})

describe('isPrivateOrUnroutableIPv6', () => {
  it('recognises loopback/link-local/unique-local forms', () => {
    expect(isPrivateOrUnroutableIPv6('::1')).toBe(true)
    expect(isPrivateOrUnroutableIPv6('fe80::1')).toBe(true)
    expect(isPrivateOrUnroutableIPv6('fd00::1')).toBe(true)
  })

  it('does not flag a normal public IPv6 address', () => {
    expect(isPrivateOrUnroutableIPv6('2001:db8::1')).toBe(false)
  })
})
