import { isIP } from 'node:net'

const CIDR_PREFIX_PATTERN = /^\d+$/

const MIN_TRUSTED_PROXY_PREFIX_LENGTH = 2

function isValidTrustedProxyEntry(entry: string): boolean {
  const slashIndex = entry.lastIndexOf('/')
  const address = slashIndex === -1 ? entry : entry.slice(0, slashIndex)
  const family = isIP(address)
  if (family === 0) return false
  if (slashIndex === -1) return true
  const prefixPart = entry.slice(slashIndex + 1)
  if (!CIDR_PREFIX_PATTERN.test(prefixPart)) return false
  const prefix = Number(prefixPart)
  const maxPrefix = family === 4 ? 32 : 128
  return prefix >= 0 && prefix <= maxPrefix
}

function isOverlyBroadTrustedProxyEntry(entry: string): boolean {
  const slashIndex = entry.lastIndexOf('/')
  if (slashIndex === -1) return false
  const prefix = Number(entry.slice(slashIndex + 1))
  return prefix < MIN_TRUSTED_PROXY_PREFIX_LENGTH
}

export function resolveTrustedProxies(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.TRUSTED_PROXIES

  if (raw === undefined || raw.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'TRUSTED_PROXIES must be set in production (#241) — an unset value makes better-auth’s ' +
          'IP resolution fail closed to a single shared bucket, which looks identical to a working ' +
          'per-IP rate limiter until measured. Set the deployment’s real trusted-proxy CIDR ranges ' +
          '(comma-separated), or TRUSTED_PROXIES=none to record "no proxy in front of this deployment" ' +
          'as a deliberate choice rather than an omission.',
      )
    }
    return []
  }

  if (raw === 'none') return []

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const invalid = entries.filter((entry) => !isValidTrustedProxyEntry(entry))
  if (invalid.length > 0) {
    throw new Error(
      `TRUSTED_PROXIES contains invalid entries: ${invalid.join(', ')} — each entry must be an IP address ` +
        'or CIDR range (e.g. "10.0.0.1" or "10.0.0.0/24"), or the literal value "none".',
    )
  }

  const tooBroad = entries.filter(isOverlyBroadTrustedProxyEntry)
  if (tooBroad.length > 0) {
    throw new Error(
      `TRUSTED_PROXIES contains overly broad entries: ${tooBroad.join(', ')} — a range with a ` +
        `prefix shorter than /${MIN_TRUSTED_PROXY_PREFIX_LENGTH} makes Fastify's proxy-addr treat the ` +
        'socket peer as trusted and return the attacker-controlled leftmost X-Forwarded-For value ' +
        '(fail-open, #241). Narrow the range to the deployment’s actual proxy CIDR.',
    )
  }

  return entries
}
