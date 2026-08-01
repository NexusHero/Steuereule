// Build-time fetch + checksum-pin for the country-level geo-IP database (#238 task
// 0b, ADR-0024). Run this deliberately, not via `postinstall` (unlike `prisma
// generate`): it makes one real outbound network call, and re-running it on every
// `pnpm install` would silently re-fetch on a schedule nobody chose. The scheduled
// refresh this file exists to support ("Robin owns a scheduled refresh") is a CI/cron
// job that invokes it explicitly — not part of this session's scope.
//
// No user IP is ever sent anywhere by this script or by the resolver it feeds — the
// download is this app fetching a public dataset for its *own* infrastructure to
// hold, once, ahead of time. That is the entire reason a build-time-fetched,
// self-hosted database was the ruling over a third-party per-request lookup API
// (ADR-0024's Definition of Ready entry on "region").
//
// *** NOT EXECUTED IN THIS SESSION — READ BEFORE RUNNING ***
// `db-ip.com` could not be reached from the sandbox this was written in (a 403
// policy denial from the outbound proxy, confirmed via its own status endpoint — see
// the PR body). Two things that follow from that, both flagged rather than guessed
// at:
//   1. GEOIP_SOURCE_URL/GEOIP_SOURCE_SHA256 below have no defaults and this script
//      refuses to run without them explicitly set — there is no pinned checksum to
//      fall back to, because none was ever fetched to pin.
//   2. The CC BY 4.0 licence line in ADR-0024/the Datenschutzerklärung (task 0c) is
//      Musti's from-memory citation, restated here, not independently confirmed
//      against DB-IP's current terms — the DoR's "Robin confirms it before the PR"
//      item is still open for the same reason (no network path to the source).
// Whoever runs this for real: fetch https://db-ip.com/db/lite.php (or the current
// IP-to-Country Lite download page) by hand first, confirm the licence text there,
// and only then set the two env vars below from what that page actually says.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'

export interface FetchGeoIpDatabaseOptions {
  sourceUrl: string
  expectedSha256: string
  /** CC BY 4.0 for DB-IP IP-to-Country Lite (ADR-0024) — passed in, not hard-coded,
   *  so a licence correction never means editing logic to fix a string. */
  licence: string
  outputCsvPath: string
  now?: () => Date
}

/** Downloads `sourceUrl`, verifies its SHA-256 against `expectedSha256` *before*
 *  writing anything (a checksum mismatch must never silently become "the new
 *  database"), gunzips it if it's gzip-compressed, and writes both the CSV and its
 *  manifest (`<outputCsvPath>.manifest.json`, matching what
 *  region-resolver.provider.ts's `resolveGeoIpDatabasePaths` expects). */
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

// Only runs when invoked directly (`tsx scripts/fetch-geoip-database.ts`) — importing
// `fetchGeoIpDatabase` for a unit test must never trigger a real network call.
if (process.argv[1]?.endsWith('fetch-geoip-database.ts')) {
  await main()
}
