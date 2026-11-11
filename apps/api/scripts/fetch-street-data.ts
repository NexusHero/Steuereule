// Downloads the street data the address search answers from (ADR-0064): the OpenStreetMap street
// extract published by the OpenPLZ API project (ODbL 1.0) — the very file the bundled PLZ table is
// built from (scripts/plz-data/build-postal-codes.mjs), pinned to the same commit.
//
//   STREET_DATA_PATH=./data/streets.csv pnpm --filter @steuereule/api run streets:fetch
//
// The file is ~55 MB and is not checked in. Without it the API still runs; the search endpoint
// then answers `available: false` and the form is filled by hand as before.
// When refreshing, bump the commit here AND in build-postal-codes.mjs, then update the checksum.
import { fetchGeoIpDatabase } from './fetch-geoip-database.js'

const SOURCE_COMMIT = 'c26389b30573ab2738d0b14fd350f143aa0a1251'
export const STREET_DATA_SOURCE_URL = `https://raw.githubusercontent.com/openpotato/openplzapi.data/${SOURCE_COMMIT}/src/de/osm/streets.updated.csv`
export const STREET_DATA_SHA256 = '1066a96a6b3a16629a94c834fca49fe58a2bb01558e17242c53a12d68b290088'

async function main(): Promise<void> {
  const outputCsvPath = process.env.STREET_DATA_PATH
  if (!outputCsvPath) throw new Error('fetch-street-data: STREET_DATA_PATH must be set to where the file should be written.')
  // The pinned-download routine (checksum check, manifest next to the file) is shared with the geo-IP database.
  await fetchGeoIpDatabase({
    sourceUrl: STREET_DATA_SOURCE_URL,
    expectedSha256: STREET_DATA_SHA256,
    licence: 'ODbL 1.0 — © OpenStreetMap contributors, via OpenPLZ API',
    outputCsvPath,
  })
  console.log(`Wrote ${outputCsvPath}`)
}

if (process.argv[1]?.endsWith('fetch-street-data.ts')) {
  await main()
}
