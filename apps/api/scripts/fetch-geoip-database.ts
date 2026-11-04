import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'

export interface FetchGeoIpDatabaseOptions {
  sourceUrl: string
  expectedSha256: string
  licence: string
  outputCsvPath: string
  now?: () => Date
}

export async function fetchGeoIpDatabase(options: FetchGeoIpDatabaseOptions): Promise<void> {
  const { sourceUrl, expectedSha256, licence, outputCsvPath, now = () => new Date() } = options

  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`fetch-geoip-database: ${sourceUrl} responded ${response.status} ${response.statusText}`)
  }
  const downloaded = Buffer.from(await response.arrayBuffer())

  const actualSha256 = createHash('sha256').update(downloaded).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `fetch-geoip-database: checksum mismatch for ${sourceUrl} — expected ${expectedSha256}, got ${actualSha256}. ` +
        'Refusing to write an unpinned database (ADR-0024).',
    )
  }

  const isGzip = downloaded.length > 2 && downloaded[0] === 0x1f && downloaded[1] === 0x8b
  const csv = isGzip ? gunzipSync(downloaded) : downloaded

  mkdirSync(dirname(outputCsvPath), { recursive: true })
  writeFileSync(outputCsvPath, csv)
  writeFileSync(
    `${outputCsvPath}.manifest.json`,
    JSON.stringify(
      { source: sourceUrl, licence, sha256: expectedSha256, fetchedAt: now().toISOString() },
      null,
      2,
    ),
  )
}

async function main(): Promise<void> {
  const sourceUrl = process.env.GEOIP_SOURCE_URL
  const expectedSha256 = process.env.GEOIP_SOURCE_SHA256
  const outputCsvPath = process.env.GEOIP_DATABASE_PATH

  if (!sourceUrl || !expectedSha256 || !outputCsvPath) {
    throw new Error(
      'fetch-geoip-database: GEOIP_SOURCE_URL, GEOIP_SOURCE_SHA256 and GEOIP_DATABASE_PATH must all be set — ' +
        'see this file\'s header comment for why there is no default to fall back to.',
    )
  }

  await fetchGeoIpDatabase({
    sourceUrl,
    expectedSha256,
    licence: process.env.GEOIP_SOURCE_LICENCE ?? 'CC BY 4.0',
    outputCsvPath,
  })
}

if (process.argv[1]?.endsWith('fetch-geoip-database.ts')) {
  await main()
}
