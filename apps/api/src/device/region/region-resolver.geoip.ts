// The concrete RegionResolver (#238 task 0b, ADR-0024). Pure logic over already-loaded
// data — no filesystem access here, deliberately: that's what makes the three
// required branches (resolvable / unresolvable / stale-database-forces-unknown)
// directly unit-testable without touching disk. The *loading* of that data (reading
// the CSV/manifest the build-time fetch script produced) lives in
// region-resolver.provider.ts, which is also where "no database configured at all"
// (the honest default before anyone has run that fetch) is decided — this class only
// ever sees the two possible outcomes of that load: present, or `null`.
import type { GeoIpManifest, GeoIpRange } from './geoip-database.js'
import { lookupCountry } from './geoip-database.js'
import { isPrivateOrUnroutableIPv4, isPrivateOrUnroutableIPv6, parseIPv4 } from './ip-address.js'
import { UNKNOWN_REGION, type RegionResolver } from './region-resolver.js'

/**
 * DB-IP publishes IP-to-Country Lite monthly. 45 days gives one missed refresh cycle
 * of slack before this resolver refuses to trust the data — long enough to absorb a
 * delayed scheduled run, short enough that a genuinely abandoned refresh (task 0b:
 * "Robin owns a scheduled refresh") shows up as every request answering `unknown`
 * rather than as silently-degrading accuracy nobody notices.
 */
export const MAX_DATABASE_AGE_MS = 45 * 24 * 60 * 60 * 1000

export interface GeoIpRegionResolverData {
  ranges: readonly GeoIpRange[] | null
  manifest: GeoIpManifest | null
}

export class GeoIpRegionResolver implements RegionResolver {
  constructor(
    private readonly data: GeoIpRegionResolverData,
    private readonly now: () => Date = () => new Date(),
  ) {}

  resolve(ip: string | null): Promise<string> {
    if (!ip) return Promise.resolve(UNKNOWN_REGION)

    // No database loaded at all (never fetched yet, or the fetch/manifest files are
    // missing/unreadable) — the honest default, not an error: every request answers
    // "unknown" until a real database exists, exactly as it did before geo-IP was
    // decided in at all.
    if (!this.data.ranges || !this.data.manifest) return Promise.resolve(UNKNOWN_REGION)

    // Staleness is checked *before* any lookup — never "usually fresh, so trust the
    // match this one time" (ADR-0021: this is a control, proven by watching it force
    // `unknown` even when the stale data would otherwise have answered).
    //
    // `fetchedAt` is untrusted input from disk (loadGeoIpManifest does a bare
    // `JSON.parse(...) as GeoIpManifest`, never validated) — an unparsable, empty, or
    // missing value makes `Date#getTime()` return `NaN`, and *every* comparison
    // against `NaN` is `false`. Left unchecked, `ageMs > MAX_DATABASE_AGE_MS` would
    // silently fall through to the lookup below instead of forcing `unknown` — the
    // exact "never a guess" promise ADR-0024:173-176 makes, broken by an unreadable
    // timestamp rather than an old one. Musti's #239 F1: fails loudly (`unknown`), not
    // silently (a guessed country from a database of unknown age).
    const fetchedAtMs = new Date(this.data.manifest.fetchedAt).getTime()
    if (!Number.isFinite(fetchedAtMs)) return Promise.resolve(UNKNOWN_REGION)
    const ageMs = this.now().getTime() - fetchedAtMs
    // A `fetchedAt` in the future is exactly as untrustworthy as one too old to
    // trust — a clock-skewed or corrupted manifest, not evidence of freshness. Same
    // "only checked one direction" shape Musti flagged for the parse failure above:
    // catch it here rather than let a negative age silently pass the `> MAX` check.
    if (ageMs < 0 || ageMs > MAX_DATABASE_AGE_MS) return Promise.resolve(UNKNOWN_REGION)

    if (isPrivateOrUnroutableIPv6(ip)) return Promise.resolve(UNKNOWN_REGION)

    const ipv4 = parseIPv4(ip)
    // Either malformed or a bare IPv6 address this minimal resolver carries no
    // country data for (see ip-address.ts) — "unknown", not a crash.
    if (ipv4 === null) return Promise.resolve(UNKNOWN_REGION)
    if (isPrivateOrUnroutableIPv4(ipv4)) return Promise.resolve(UNKNOWN_REGION)

    const country = lookupCountry(this.data.ranges, ipv4)
    return Promise.resolve(country ?? UNKNOWN_REGION)
  }
}
