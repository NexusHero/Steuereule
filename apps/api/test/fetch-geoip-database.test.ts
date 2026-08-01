// fetchGeoIpDatabase's own logic (#238 task 0b) — checksum verification and manifest
// writing — against a *mocked* fetch. Never a real network call in a test (this repo
// has no network access to db-ip.com in CI either, and shouldn't need one to prove
// this function's behaviour is correct).
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchGeoIpDatabase } from '../scripts/fetch-geoip-database.js'
import type { GeoIpManifest } from '../src/device/region/geoip-database.js'

const CSV = '203.0.113.0,203.0.113.255,DE\n'

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

describe('fetchGeoIpDatabase', () => {
  let dir: string
  let outputCsvPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetch-geoip-test-'))
    outputCsvPath = join(dir, 'geoip-country-lite.csv')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('writes the CSV and a manifest recording source/licence/checksum/fetchedAt', async () => {
    const body = Buffer.from(CSV)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))

    const fixedNow = new Date('2026-08-01T00:00:00.000Z')
    await fetchGeoIpDatabase({
      sourceUrl: 'https://example.invalid/dbip-country-lite-test.csv',
      expectedSha256: sha256(body),
      licence: 'CC BY 4.0',
      outputCsvPath,
      now: () => fixedNow,
    })

    expect(readFileSync(outputCsvPath, 'utf-8')).toBe(CSV)
    const manifest = JSON.parse(readFileSync(`${outputCsvPath}.manifest.json`, 'utf-8')) as GeoIpManifest
    expect(manifest).toEqual({
      source: 'https://example.invalid/dbip-country-lite-test.csv',
      licence: 'CC BY 4.0',
      sha256: sha256(body),
      fetchedAt: fixedNow.toISOString(),
    })
  })

  it('transparently gunzips a gzip-compressed response', async () => {
    const gzipped = gzipSync(Buffer.from(CSV))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(gzipped, { status: 200 })))

    await fetchGeoIpDatabase({
      sourceUrl: 'https://example.invalid/dbip-country-lite-test.csv.gz',
      expectedSha256: sha256(gzipped),
      licence: 'CC BY 4.0',
      outputCsvPath,
    })

    expect(readFileSync(outputCsvPath, 'utf-8')).toBe(CSV)
  })

  it('refuses to write anything on a checksum mismatch — never trusts an unpinned download', async () => {
    const body = Buffer.from(CSV)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))

    await expect(
      fetchGeoIpDatabase({
        sourceUrl: 'https://example.invalid/dbip-country-lite-test.csv',
        expectedSha256: 'deliberately-wrong-checksum',
        licence: 'CC BY 4.0',
        outputCsvPath,
      }),
    ).rejects.toThrow(/checksum mismatch/)

    expect(existsSync(outputCsvPath)).toBe(false)
    expect(existsSync(`${outputCsvPath}.manifest.json`)).toBe(false)
  })

  it('surfaces a non-2xx response as an error rather than writing an error page as if it were data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' })))

    await expect(
      fetchGeoIpDatabase({
        sourceUrl: 'https://example.invalid/missing.csv',
        expectedSha256: 'irrelevant',
        licence: 'CC BY 4.0',
        outputCsvPath,
      }),
    ).rejects.toThrow(/404/)
    expect(existsSync(outputCsvPath)).toBe(false)
  })
})
