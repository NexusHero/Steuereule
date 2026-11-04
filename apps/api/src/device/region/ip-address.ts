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

export function isPrivateOrUnroutableIPv4(value: number): boolean {
  const inRange = (base: string, prefixLength: number): boolean => {
    const baseValue = parseIPv4(base)!
    const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
    return (value & mask) === (baseValue & mask)
  }

  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    inRange('224.0.0.0', 4)
  )
}

export function isPrivateOrUnroutableIPv6(input: string): boolean {
  const lower = input.toLowerCase()
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}
