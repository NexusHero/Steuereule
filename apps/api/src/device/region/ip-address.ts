export function parseIPv4(input: string): number | null {
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
 * IPv4 blocks that never locate a user (RFC 6890 special-purpose registry), as first octet and
 * prefix length. Written as numbers rather than address strings: they are protocol constants,
 * not configuration (Sonar S1313).
 */
const UNROUTABLE_IPV4_BLOCKS: ReadonlyArray<{ readonly octets: readonly [number, number, number, number]; readonly prefix: number; readonly name: string }> = [
  { octets: [0, 0, 0, 0], prefix: 8, name: '„this network“ (RFC 791)' },
  { octets: [10, 0, 0, 0], prefix: 8, name: 'private (RFC 1918)' },
  { octets: [100, 64, 0, 0], prefix: 10, name: 'shared address space / CGNAT (RFC 6598)' },
  { octets: [127, 0, 0, 0], prefix: 8, name: 'loopback (RFC 1122)' },
  { octets: [169, 254, 0, 0], prefix: 16, name: 'link-local (RFC 3927)' },
  { octets: [172, 16, 0, 0], prefix: 12, name: 'private (RFC 1918)' },
  { octets: [192, 168, 0, 0], prefix: 16, name: 'private (RFC 1918)' },
  { octets: [224, 0, 0, 0], prefix: 4, name: 'multicast (RFC 5771)' },
]

const toNumber = ([a, b, c, d]: readonly [number, number, number, number]): number => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0

export function isPrivateOrUnroutableIPv4(value: number): boolean {
  return UNROUTABLE_IPV4_BLOCKS.some(({ octets, prefix }) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return ((value & mask) >>> 0) === ((toNumber(octets) & mask) >>> 0)
  })
}

export function isPrivateOrUnroutableIPv6(input: string): boolean {
  const lower = input.toLowerCase()
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}
