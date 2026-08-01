// The trusted-proxy resolver (#241) — deployment topology for the API's own reverse
// proxy/load balancer, mirroring the existing `resolve*(env)` idiom
// (resolveBetterAuthSecret / resolveBetterAuthUrl / resolveGoogleClientId in
// ./better-auth.ts). Deliberately here, in apps/api/src/config/, not in
// @steuereule/core: this is deployment-specific infrastructure knowledge for this one
// API process, not a shared domain rule the frontend or any other consumer needs.
//
// One resolver, consumed by every IP-trust-dependent subsystem — never one env var
// per subsystem. #241 wires this into better-auth's own `advanced.ipAddress.trustedProxies`
// (governs Session.ipAddress and better-auth's built-in rate limiter, both keyed by
// `getIp()`, which reads X-Forwarded-For). Fastify's own `trustProxy` (governs
// `request.ip`, used by #238's device endpoints including the mint rate limiter) is
// NOT wired here — that is #238's own follow-up — but it MUST consume this same
// resolver's output when it lands, not a second, independently-drifting env var for
// the same underlying fact (deployment reverse-proxy addresses do not change
// depending on which subsystem is asking).
//
// The asymmetry that makes shared validation matter (Musti's #241 review, confirmed by
// direct measurement against the real modules, not derived):
//   - better-auth's own IP-header parser (`getIPFromHeader`,
//     `@better-auth/core/utils/ip`) strips trusted hops from the right; if every hop in
//     the chain is trusted, the loop exhausts and it returns `null` (a single shared
//     bucket) — too STRICT. Fail-CLOSED.
//   - Fastify's `@fastify/proxy-addr` (used by `trustProxy`, not wired here) returns the
//     LEFTMOST address once the trusted set covers the right end of the chain — fully
//     attacker-steerable if the trusted range is too broad. Fail-OPEN. Measured directly
//     (`@fastify/proxy-addr@5.1.0`, peer `127.0.0.1`, XFF `203.0.113.66, 127.0.0.1`,
//     `trustProxy: ["127.0.0.0/8"]` → returns the spoofed `203.0.113.66`).
// The SAME value is safe for one subsystem and dangerous for the other depending on how
// broadly it's drawn — exactly why validation belongs here, once, rather than being
// duplicated (and inevitably drifting) at each call site.
//
// A single-value X-Forwarded-For sent directly by an attacker is NOT closable by this
// resolver, at any configured value (#241, Musti's review — measured against the real
// module): with `trustedProxies` unset, a lone spoofed value is trusted verbatim; with
// `trustedProxies` configured, that same lone value still isn't matched against
// anything (there's nothing to its right to strip), so it is *still* returned as the
// resolved client. The only real defence against that is a network property — the app
// being unreachable except through the real proxy (#246) — not an application
// configuration value. Nothing built against this resolver should imply otherwise.
const CIDR_PREFIX_PATTERN = /^\d+$/

/** Whether `entry` is a syntactically valid IP address or `IP/prefix` CIDR range.
 *  Deliberately does NOT reject an overly-broad range (e.g. `0.0.0.0/0`) — Robin
 *  checked, not assumed: `@fastify/proxy-addr` already throws on that itself
 *  ("invalid range on address: 0.0.0.0/0"), so a second guard here would be partly
 *  redundant; and better-auth's own trustedProxies handling only warns on an invalid
 *  entry rather than rejecting it, which is why this resolver validates syntax at all
 *  — an unparseable entry should fail loud, at boot, where the information is
 *  available, not warn quietly into a log nobody is watching. */
function isValidTrustedProxyEntry(entry: string): boolean {
  const slashIndex = entry.lastIndexOf('/')
  const address = slashIndex === -1 ? entry : entry.slice(0, slashIndex)
  const family = ipFamily(address)
  if (family === 0) return false
  if (slashIndex === -1) return true
  const prefixPart = entry.slice(slashIndex + 1)
  if (!CIDR_PREFIX_PATTERN.test(prefixPart)) return false
  const prefix = Number(prefixPart)
  const maxPrefix = family === 4 ? 32 : 128
  return prefix >= 0 && prefix <= maxPrefix
}

/** 4 for a valid IPv4 address, 6 for IPv6, 0 for neither — the exact shape Node's own
 *  `net.isIP` already returns; re-implemented as a thin wrapper only so this file
 *  doesn't depend on `node:net`'s IPv6 quirks for the (very small) validation surface
 *  it actually needs. */
function ipFamily(address: string): 0 | 4 | 6 {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(address) && address.split('.').every((octet) => Number(octet) <= 255)) return 4
  if (/^[0-9a-fA-F:]+$/.test(address) && address.includes(':')) return 6
  return 0
}

/**
 * Resolves the API's own reverse-proxy trust configuration for `TRUSTED_PROXIES`.
 *
 * - Unset outside production: returns `[]` — matches today's actual shipped
 *   behaviour (no `trustedProxies` configured anywhere), so introducing this seam
 *   changes nothing about the current runtime posture until a real value is set.
 * - Unset in production: **throws**. Not because an empty value makes anything
 *   spoofable (it doesn't — `getIp()` already defaults to this exact posture) but
 *   because the degraded state is invisible otherwise: a shared rate-limit bucket
 *   looks identical to a working per-IP limiter until someone measures it (ADR-0021).
 *   Throwing at boot is the loud version of that measurement.
 * - `TRUSTED_PROXIES=none`: an explicit, deliberate "no proxy in front of this
 *   deployment" — resolves to `[]`, same runtime effect as unset, but recorded as a
 *   choice rather than an omission. Valid in production; boots.
 * - Otherwise: a comma-separated list of IP/CIDR entries, validated syntactically.
 *   Any invalid entry throws — see `isValidTrustedProxyEntry`'s own comment for why
 *   this resolver validates rather than warning.
 *
 * The real production value (the deployment's actual proxy CIDR ranges) is explicitly
 * NOT part of this ticket's Definition of Done — it depends on #246, the still-missing
 * deployment pipeline. This resolver's production-throw exists so that gap cannot stay
 * silently open once #246 lands: the API will refuse to boot in production without an
 * explicit answer, at the moment the answer becomes knowable.
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

  return entries
}
