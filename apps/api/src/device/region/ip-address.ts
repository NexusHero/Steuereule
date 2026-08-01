// Small, dependency-free IPv4 helpers for RegionResolver (#238 task 0b). Deliberately
// not a general-purpose IP library — the only two things a country-lookup resolver
// needs are "is this address even eligible to look up" (private/unroutable never is)
// and "turn it into a comparable integer to range-search the geo-IP database".

/** Parses a dotted-quad IPv4 address into its 32-bit unsigned integer form, or
 *  `null` if `input` isn't one — including an IPv6 address, which this minimal
 *  resolver doesn't carry country data for (see geoip-database.ts's header comment). */
export function parseIPv4(input: string): number | null {
  // Node/Fastify's `request.ip` can hand back an IPv4-mapped IPv6 form
  // (`::ffff:203.0.113.5`) for some socket configurations — unwrap it to the plain
  // IPv4 address it actually represents rather than treating it as unroutable.
  const unwrapped = input.startsWith('::ffff:') ? input.slice('::ffff:'.length) : input

  const parts = unwrapped.split('.')
  if (parts.length !== 4) return null

  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = (value << 8) | octet
  }
  return value >>> 0
}

/**
 * RFC 1918 private ranges, loopback, link-local, CGNAT (RFC 6598), and the
 * "this network"/unspecified block — the address classes a real client on the
 * public internet can never present, so a country lookup against any of them would
 * only ever be a guess dressed up as data. Deliberately conservative: when in doubt,
 * this returns `true` (unroutable) rather than `false` — the fallback path
 * (UNKNOWN_REGION) is always safe, a wrongly-claimed country is not.
 */
export function isPrivateOrUnroutableIPv4(value: number): boolean {
  const inRange = (base: string, prefixLength: number): boolean => {
    const baseValue = parseIPv4(base)!
    const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
    return (value & mask) === (baseValue & mask)
  }

  return (
    inRange('0.0.0.0', 8) || // "this network"
    inRange('10.0.0.0', 8) || // RFC 1918
    inRange('100.64.0.0', 10) || // RFC 6598 (CGNAT)
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local
    inRange('172.16.0.0', 12) || // RFC 1918
    inRange('192.168.0.0', 16) || // RFC 1918
    inRange('224.0.0.0', 4) // multicast + reserved (224.0.0.0-255.255.255.255)
  )
}

/** Loopback/unique-local/link-local IPv6 forms worth recognising even though this
 *  resolver carries no IPv6 country data (see geoip-database.ts) — so at least the
 *  unroutable cases are still classified rather than silently falling through to
 *  "not IPv4, therefore not looked up" for the wrong reason. */
export function isPrivateOrUnroutableIPv6(input: string): boolean {
  const lower = input.toLowerCase()
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}
