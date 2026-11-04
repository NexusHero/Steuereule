import { readFileSync } from 'node:fs'
import { parseIPv4 } from './ip-address.js'

export interface GeoIpManifest {
  source: string
  licence: string
  sha256: string
  fetchedAt: string
}

export interface GeoIpRange {
  startIPv4: number
  endIPv4: number
  countryCode: string
}

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
