#!/usr/bin/env node
// Builds apps/api/assets/hebesaetze/plz-ags.json: per postal code, the places of the app's postal-code
// table (packages/core/src/common/postal-codes.data.ts) with their Amtlicher Gemeindeschlüssel. With it
// a PLZ resolves to the Gemeinde of the Hebesatz table by AGS, without asking where the PLZ has one
// Gemeinde, and the name is no longer needed to tell two Gemeinden of the same name apart.
//
// Same source and the same ranking as scripts/plz-data/build-postal-codes.mjs (OpenPLZ street extract,
// ODbL 1.0), but the RegionalKey column is kept. It lives in apps/api, not in core: the web bundle
// needs only the PLZ → Ort table it already has.
//
//   node scripts/hebesaetze/build-plz-ags.mjs                       # downloads the pinned commit
//   node scripts/hebesaetze/build-plz-ags.mjs --source ./streets.updated.csv
// Keep SOURCE_COMMIT equal to the one in build-postal-codes.mjs, so both tables list the same places.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_REPO = 'openpotato/openplzapi.data'
const SOURCE_COMMIT = 'c26389b30573ab2738d0b14fd350f143aa0a1251'
const SOURCE_FILE = 'src/de/osm/streets.updated.csv'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'apps/api/assets/hebesaetze/plz-ags.json')

const STATE_BY_KEY = {
  '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE', '07': 'RP', '08': 'BW',
  '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB', '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH',
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

async function loadSource() {
  const i = process.argv.indexOf('--source')
  if (i !== -1) return readFile(process.argv[i + 1], 'utf8')
  const url = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/${SOURCE_FILE}`
  console.log(`[plz-ags] downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
  return res.text()
}

const lines = (await loadSource()).split(/\r?\n/)
const header = parseCsvLine(lines[0])
const [iPlz, iOrt, iKey] = ['PostalCode', 'Locality', 'RegionalKey'].map((name) => {
  const idx = header.indexOf(name)
  if (idx === -1) throw new Error(`column ${name} missing in ${header.join(',')}`)
  return idx
})

/** plz → Map("ort~land~ags" → number of streets) */
const byPlz = new Map()
for (const line of lines.slice(1)) {
  if (!line) continue
  const row = parseCsvLine(line)
  const plz = row[iPlz]
  const ort = row[iOrt]?.trim()
  const ags = row[iKey]?.trim()
  const land = STATE_BY_KEY[ags?.slice(0, 2)]
  if (!plz || !ort || !land || !/^\d{8}$/.test(ags)) continue
  const places = byPlz.get(plz) ?? new Map()
  const key = `${ort}~${land}~${ags}`
  places.set(key, (places.get(key) ?? 0) + 1)
  byPlz.set(plz, places)
}

const entries = {}
let unique = 0
for (const [plz, places] of [...byPlz.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  // Ranked and filtered as in build-postal-codes.mjs: by street count, a single stray street dropped
  // unless it is all there is, so the places here are the places the app offers for this PLZ.
  const ranked = [...places.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
  const kept = ranked.filter(([, streets], index) => index === 0 || streets > 1)
  entries[plz] = kept.map(([key]) => {
    const [ort, land, ags] = key.split('~')
    return { ort, land, ags }
  })
  if (new Set(entries[plz].map((p) => p.ags)).size === 1) unique += 1
}

const count = Object.keys(entries).length
if (count < 8000 || count > 8400) throw new Error(`expected about 8.200 postal codes, got ${count}`)

const head = {
  source: {
    name: 'OpenStreetMap (OpenPLZ API extract)',
    url: `https://github.com/${SOURCE_REPO}/blob/${SOURCE_COMMIT}/${SOURCE_FILE}`,
    commit: SOURCE_COMMIT,
  },
  license: 'Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors',
  retrieved: new Date().toISOString().slice(0, 10),
  format: 'PLZ → places [{ ort, land, ags }], most likely first; ags = Amtlicher Gemeindeschlüssel (8 digits)',
  count,
  uniqueGemeinde: unique,
}
const body = Object.entries(entries).map(([plz, places]) => `    ${JSON.stringify(plz)}: ${JSON.stringify(places)}`).join(',\n')
await writeFile(OUT, `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "entries": {\n${body}\n  }\n}\n`)
console.log(`[plz-ags] ${count} postal codes, ${unique} with exactly one Gemeinde -> ${path.relative(ROOT, OUT)}`)
