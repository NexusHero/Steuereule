// The one source of "which reverse-proxy hops to trust" for the API process.
// Fastify's `trustProxy` (governs `request.ip`, the device endpoints and the
// throttler's IP key) and better-auth's `advanced.ipAddress.trustedProxies`
// (governs `getIp()`, `Session.ipAddress` and better-auth's own rate limiter)
// both consume `resolveTrustedProxies()` — never two independently-drifting env
// reads for the same underlying fact (the deployment's proxy addresses).
//
// The fail-open/fail-closed asymmetry that motivated this seam (#241, ADR-0035):
// better-auth's `getIPFromHeader` strips trusted hops from the right and returns
// `null` (a shared bucket) when every hop is trusted — fail-CLOSED; Fastify's
// `@fastify/proxy-addr` returns the LEFTMOST address once the trusted set covers
// the right end — fail-OPEN if the trusted range is broad enough to cover the
// socket peer (measured: `trustProxy: ['0.0.0.0/1']`, peer `127.0.0.1`, XFF
// `203.0.113.66, 127.0.0.1` → returns the spoofed `203.0.113.66`). The SAME value
// is safe for one consumer and dangerous for the other, so validation lives here,
// once. The breadth guard below closes the fail-open case: a trusted range broad
// enough to swallow the socket peer (`/0`, `/1`) is rejected at config time.
//
// A single-value `X-Forwarded-For` sent directly by an attacker is NOT closable
// by any configured value here — only the network property of the app being
// unreachable except through the real proxy is (#292). Nothing built on this
// resolver implies otherwise.
import { isIP } from 'node:net'

const CIDR_PREFIX_PATTERN = /^\d+$/

// Below this prefix length a trusted range covers so much of the address space
// that `@fastify/proxy-addr` treats the socket peer as trusted and returns the
// attacker-controlled leftmost `X-Forwarded-For` value (fail-open). `/0` and `/1`
// are the two lengths that do this for both address families (measured against
// `@fastify/proxy-addr@5.1.0`); `/2` and narrower leave the loopback/socket peer
// outside the trusted set and fail closed instead.
const MIN_TRUSTED_PROXY_PREFIX_LENGTH = 2

/** Whether `entry` is a syntactically valid IP address or `IP/prefix` CIDR range. */
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

/** Whether `entry` is a CIDR range whose prefix is broad enough to be unsafe for
 *  `@fastify/proxy-addr` (fail-open) — never a bare IP (an exact host is narrow
 *  by construction). */
function isOverlyBroadTrustedProxyEntry(entry: string): boolean {
  const slashIndex = entry.lastIndexOf('/')
  if (slashIndex === -1) return false
  const prefix = Number(entry.slice(slashIndex + 1))
  return prefix < MIN_TRUSTED_PROXY_PREFIX_LENGTH
}

/**
 * Resolves the API's own reverse-proxy trust configuration for `TRUSTED_PROXIES`.
 *
 * - Unset outside production: `[]` — today's actual posture (no proxy trusted).
 * - Unset in production: throws — the degraded state (a shared rate-limit bucket)
 *   is invisible otherwise (ADR-0021), so a missing answer refuses to boot.
 * - `none`: an explicit "no proxy in front of this deployment" — resolves `[]`,
 *   valid in production.
 * - Otherwise: a comma-separated list of IP/CIDR entries, validated syntactically
 *   AND for breadth (see `isOverlyBroadTrustedProxyEntry`); any invalid entry throws.
 */
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
