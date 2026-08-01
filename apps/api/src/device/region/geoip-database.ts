// Loads and queries the self-hosted, build-time-fetched country-level geo-IP
// database (#238 task 0b, ADR-0024) — never a third-party lookup API (that would
// send a user's IP to a processor with no agreement in place; ADR-0024's Definition
// of Ready entry on "region" is explicit about this).
//
// File shape: a headerless CSV of `start_ip,end_ip,country_code` rows (DB-IP's own
// "IP-to-Country Lite" export shape — see scripts/fetch-geoip-database.ts for the
// fetch/pin mechanism), sorted by `start_ip`, plus a co-located JSON manifest
// (`<csv path>.manifest.json`) recording when it was fetched. IPv4 only for now — see
// ip-address.ts's header comment; an IPv6 row would simply never match `parseIPv4`
// and fall through to `null` (unresolved), which is safe, just incomplete.
import { readFileSync } from 'node:fs'
import { parseIPv4 } from './ip-address.js'

export interface GeoIpManifest {
  /** Where this database was fetched from — carried into the Datenschutzerklärung's
   *  attribution line (task 0c), not just an internal record. */
  source: string
  /** CC BY 4.0 (DB-IP IP-to-Country Lite) as recommended in ADR-0024 — see that ADR
   *  for the licence-confirmation status. */
  licence: string
  /** SHA-256 of the fetched CSV, pinned at fetch time (scripts/fetch-geoip-database.ts) —
   *  recorded here for traceability; the actual verification happens once, at fetch
   *  time, not on every resolver load. */
  sha256: string
  /** ISO 8601 — when this database was fetched. Staleness (see MAX_DATABASE_AGE_MS)
   *  is computed against this, not against the file's mtime, so a `touch` or a copy
   *  between hosts can't accidentally un-stale an old database. */
  fetchedAt: string
}

export interface GeoIpRange {
  startIPv4: number
  endIPv4: number
  countryCode: string
}

/** Parses the CSV shape described above. A malformed row is skipped, not fatal — one
 *  bad line in a database with hundreds of thousands of rows must not take country
 *  resolution down entirely; the resolver's job is to answer "unknown" for gaps, not
 *  to crash the endpoint that owns match-verification. */
export function parseGeoIpCsv(csv: string): GeoIpRange[] {
  const ranges: GeoIpRange[] = []
  for (const line of csv.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const [startRaw, endRaw, countryCode] = trimmed.split(',')
    if (!startRaw || !endRaw || !countryCode) continue
    const start = parseIPv4(startRaw)
    const end = parseIPv4(endRaw)
    if (start === null || end === null) continue
    ranges.push({ startIPv4: start, endIPv4: end, countryCode: countryCode.trim().toUpperCase() })
  }
  return ranges
}

/** Binary search over `ranges` (must be sorted by `startIPv4`, exactly how DB-IP's
 *  own export is ordered) — the only shape that scales to a real internet-sized
 *  country database without a linear scan per request. */
export function lookupCountry(ranges: readonly GeoIpRange[], ipv4: number): string | null {
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const range = ranges[mid]!
    if (ipv4 < range.startIPv4) {
      high = mid - 1
    } else if (ipv4 > range.endIPv4) {
      low = mid + 1
    } else {
      return range.countryCode
    }
  }
  return null
}

export function loadGeoIpManifest(manifestPath: string): GeoIpManifest {
  const raw = readFileSync(manifestPath, 'utf-8')
  return JSON.parse(raw) as GeoIpManifest
}

export function loadGeoIpRanges(csvPath: string): GeoIpRange[] {
  return parseGeoIpCsv(readFileSync(csvPath, 'utf-8'))
}
