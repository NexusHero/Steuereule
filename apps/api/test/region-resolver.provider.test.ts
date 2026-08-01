import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  geoIpRegionResolverProvider,
  resolveGeoIpDatabasePaths,
} from '../src/device/region/region-resolver.provider.js'
import { UNKNOWN_REGION } from '../src/device/region/region-resolver.js'

describe('resolveGeoIpDatabasePaths', () => {
  it('returns undefined when GEOIP_DATABASE_PATH is unset — the honest "never fetched" default', () => {
    expect(resolveGeoIpDatabasePaths({})).toBeUndefined()
  })

  it('derives the manifest path by convention, never a second independently-configurable path', () => {
    const paths = resolveGeoIpDatabasePaths({ GEOIP_DATABASE_PATH: '/data/geoip-country-lite.csv' })
    expect(paths).toEqual({
      csvPath: '/data/geoip-country-lite.csv',
      manifestPath: '/data/geoip-country-lite.csv.manifest.json',
    })
  })
})

describe('geoIpRegionResolverProvider — file loading', () => {
  let dir: string
  let originalEnv: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'geoip-test-'))
    originalEnv = process.env.GEOIP_DATABASE_PATH
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.GEOIP_DATABASE_PATH
    else process.env.GEOIP_DATABASE_PATH = originalEnv
  })

  it('resolves every request as "unknown" when no database is configured at all', async () => {
    delete process.env.GEOIP_DATABASE_PATH
    const resolver = await geoIpRegionResolverProvider.useFactory!()
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
  })

  it('resolves every request as "unknown", not a thrown error, when the configured files do not exist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.GEOIP_DATABASE_PATH = join(dir, 'does-not-exist.csv')
    const resolver = await geoIpRegionResolverProvider.useFactory!()
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe(UNKNOWN_REGION)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('loads a real CSV+manifest pair and resolves a genuinely covered address', async () => {
    const csvPath = join(dir, 'geoip-country-lite.csv')
    writeFileSync(csvPath, '203.0.113.0,203.0.113.255,DE\n')
    writeFileSync(
      `${csvPath}.manifest.json`,
      JSON.stringify({
        source: 'https://example.invalid/dbip-country-lite-test.csv',
        licence: 'CC BY 4.0',
        sha256: 'test-checksum',
        fetchedAt: new Date().toISOString(),
      }),
    )
    process.env.GEOIP_DATABASE_PATH = csvPath

    const resolver = await geoIpRegionResolverProvider.useFactory!()
    await expect(resolver.resolve('203.0.113.42')).resolves.toBe('DE')
  })
})
