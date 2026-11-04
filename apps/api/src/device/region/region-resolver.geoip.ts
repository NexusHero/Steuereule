import type { GeoIpManifest, GeoIpRange } from './geoip-database.js'
import { lookupCountry } from './geoip-database.js'
import { isPrivateOrUnroutableIPv4, isPrivateOrUnroutableIPv6, parseIPv4 } from './ip-address.js'
import { UNKNOWN_REGION, type RegionResolver } from './region-resolver.js'

export const MAX_DATABASE_AGE_MS = 45 * 24 * 60 * 60 * 1000

export interface GeoIpRegionResolverData {
  ranges: readonly GeoIpRange[] | null
  manifest: GeoIpManifest | null
}

/** The concrete RegionResolver. */
export class GeoIpRegionResolver implements RegionResolver {
  constructor(
    private readonly data: GeoIpRegionResolverData,
    private readonly now: () => Date = () => new Date(),
  ) {}

  resolve(ip: string | null): Promise<string> {
    if (!ip) return Promise.resolve(UNKNOWN_REGION)

    if (!this.data.ranges || !this.data.manifest) return Promise.resolve(UNKNOWN_REGION)

    const fetchedAtMs = new Date(this.data.manifest.fetchedAt).getTime()
    if (!Number.isFinite(fetchedAtMs)) return Promise.resolve(UNKNOWN_REGION)
    const ageMs = this.now().getTime() - fetchedAtMs
    if (ageMs < 0 || ageMs > MAX_DATABASE_AGE_MS) return Promise.resolve(UNKNOWN_REGION)

    if (isPrivateOrUnroutableIPv6(ip)) return Promise.resolve(UNKNOWN_REGION)

    const ipv4 = parseIPv4(ip)
    if (ipv4 === null) return Promise.resolve(UNKNOWN_REGION)
    if (isPrivateOrUnroutableIPv4(ipv4)) return Promise.resolve(UNKNOWN_REGION)

    const country = lookupCountry(this.data.ranges, ipv4)
    return Promise.resolve(country ?? UNKNOWN_REGION)
  }
}
