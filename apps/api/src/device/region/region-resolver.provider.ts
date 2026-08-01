// The DI wiring + config/env seam for RegionResolver (#238 task 0b), mirroring
// resolveFieldEncryptionKey()/resolveCorsOrigins()'s `resolve*(env)` idiom: config
// comes from env (12-Factor III), and — same shape as ENCRYPTED_PRISMA's
// FactoryProvider — the thing that touches the filesystem is a factory, not the
// resolver class itself (see region-resolver.geoip.ts's header comment for why that
// split is what makes the resolver's own logic directly unit-testable).
import type { FactoryProvider } from '@nestjs/common'
import { loadGeoIpManifest, loadGeoIpRanges, type GeoIpManifest, type GeoIpRange } from './geoip-database.js'
import { GeoIpRegionResolver, type GeoIpRegionResolverData } from './region-resolver.geoip.js'
import { REGION_RESOLVER, type RegionResolver } from './region-resolver.js'

export interface GeoIpDatabasePaths {
  csvPath: string
  manifestPath: string
}

/**
 * `GEOIP_DATABASE_PATH` points at the CSV `scripts/fetch-geoip-database.ts` writes;
 * the manifest is always co-located as `<csvPath>.manifest.json` (one env var, not
 * two, to remove a way for the pair to point at mismatched files). Unset in any
 * environment where the fetch has never run — resolves to `undefined`, which the
 * factory below turns into "no database loaded" (RegionResolver's honest default),
 * not an error.
 */
export function resolveGeoIpDatabasePaths(env: NodeJS.ProcessEnv = process.env): GeoIpDatabasePaths | undefined {
  const csvPath = env.GEOIP_DATABASE_PATH
  if (!csvPath || csvPath.length === 0) return undefined
  return { csvPath, manifestPath: `${csvPath}.manifest.json` }
}

/** Loads the CSV/manifest pair if configured and readable; `null` fields otherwise
 *  (missing file, unset env var, or a genuine read/parse error) — every one of those
 *  is the same "no trustworthy database" outcome from RegionResolver's point of
 *  view, so they're deliberately not distinguished here. A load failure is logged
 *  (this is a control, ADR-0021 — going quiet about *why* resolution always answers
 *  "unknown" would defeat the point of it being provable) but never thrown; a
 *  missing geo-IP database must never be the reason `/v1/device/code` fails. */
function tryLoadDatabase(paths: GeoIpDatabasePaths | undefined): GeoIpRegionResolverData {
  if (!paths) return { ranges: null, manifest: null }
  try {
    const ranges: readonly GeoIpRange[] = loadGeoIpRanges(paths.csvPath)
    const manifest: GeoIpManifest = loadGeoIpManifest(paths.manifestPath)
    return { ranges, manifest }
  } catch (error) {
    // This must be visible, not swallowed, but must also never block the request —
    // see the comment above. (No lint suppression needed here: ADR-0019 replaced
    // ESLint with oxlint, and this project's .oxlintrc.json does not enable
    // `no-console` — a stray `eslint-disable-next-line` previously sat here
    // suppressing nothing, exactly the kind of mechanism that looks like it
    // controls something and doesn't.)
    console.warn(`[RegionResolver] Could not load geo-IP database (${paths.csvPath}): ${String(error)} — resolving every request as "unknown".`)
    return { ranges: null, manifest: null }
  }
}

export const geoIpRegionResolverProvider: FactoryProvider<RegionResolver> = {
  provide: REGION_RESOLVER,
  useFactory: (): RegionResolver => new GeoIpRegionResolver(tryLoadDatabase(resolveGeoIpDatabasePaths())),
}
