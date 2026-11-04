import { Logger, type FactoryProvider } from '@nestjs/common'
import { loadGeoIpManifest, loadGeoIpRanges, type GeoIpManifest, type GeoIpRange } from './geoip-database.js'
import { GeoIpRegionResolver, type GeoIpRegionResolverData } from './region-resolver.geoip.js'
import { REGION_RESOLVER, type RegionResolver } from './region-resolver.js'

export interface GeoIpDatabasePaths {
  csvPath: string
  manifestPath: string
}

export function resolveGeoIpDatabasePaths(env: NodeJS.ProcessEnv = process.env): GeoIpDatabasePaths | undefined {
  const csvPath = env.GEOIP_DATABASE_PATH
  if (!csvPath || csvPath.length === 0) return undefined
  return { csvPath, manifestPath: `${csvPath}.manifest.json` }
}

const logger = new Logger('RegionResolver')

function tryLoadDatabase(paths: GeoIpDatabasePaths | undefined): GeoIpRegionResolverData {
  if (!paths) return { ranges: null, manifest: null }
  try {
    const ranges: readonly GeoIpRange[] = loadGeoIpRanges(paths.csvPath)
    const manifest: GeoIpManifest = loadGeoIpManifest(paths.manifestPath)
    return { ranges, manifest }
  } catch (error) {
    logger.warn(`Could not load geo-IP database (${paths.csvPath}): ${String(error)}; every request resolves as "unknown".`)
    return { ranges: null, manifest: null }
  }
}

export const geoIpRegionResolverProvider: FactoryProvider<RegionResolver> = {
  provide: REGION_RESOLVER,
  useFactory: (): RegionResolver => new GeoIpRegionResolver(tryLoadDatabase(resolveGeoIpDatabasePaths())),
}
