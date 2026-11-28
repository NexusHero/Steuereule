#!/usr/bin/env node
// Builds apps/api/assets/hebesaetze/<year>.json: the Gewerbesteuer-Hebesatz of every Gemeinde, from
// the official tables of the Statistische Ämter des Bundes und der Länder (ADR-0101 §9; the user can
// correct the value in the app). The data stays in apps/api: ~11.000 Gemeinden per year do not
// belong in the web bundle.
//
//   node scripts/hebesaetze/download-hebesaetze.mjs            # downloads the sources below
//   node scripts/hebesaetze/download-hebesaetze.mjs --check    # fails if a committed file would change
//
// Sources, per year (docs/research/self-employed-forms.html, "Hebesätze"):
// - up to 2022 the yearly publication "Hebesätze der Realsteuern" (xlsx, one sheet per Land); it was
//   discontinued after the 2022 edition;
// - from 2023 the data moved to the Regionaldatenbank Deutschland (table 71231-01-03-5), which
//   serves it only to registered users. Destatis also publishes each year's table as the CSV behind
//   its map "Hebesätze der Gemeinden"; 2024 is online there, 2023 is no longer served.
// A year without an obtainable table gets a file that says so and names the year to fall back to.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWorkbook } from './xlsx.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = path.join(ROOT, 'apps/api/assets/hebesaetze')
const UA = 'Mozilla/5.0 (compatible; steuereule-hebesaetze/1.0)'
const YEARS = [2022, 2023, 2024, 2025, 2026]

/** First two digits of the AGS → the state code of `GERMAN_STATES` (as in scripts/plz-data). */
const LAND_BY_KEY = {
  '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE', '07': 'RP', '08': 'BW',
  '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB', '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH',
}

const SOURCES = {
  2022: {
    kind: 'xlsx',
    url: 'https://www.destatis.de/DE/Themen/Staat/Steuern/Steuereinnahmen/Publikationen/Downloads-Realsteuern/hebesaetze-realsteuern-8148001227005.xlsx',
    title: 'Hebesätze der Realsteuern, Ausgabe 2022',
    publisher: 'Statistische Ämter des Bundes und der Länder (Herstellung: Information und Technik Nordrhein-Westfalen)',
    attribution: 'Quelle: Statistische Ämter des Bundes und der Länder, Hebesätze der Realsteuern 2022',
    terms: 'Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet (Impressum der Veröffentlichung).',
  },
  2024: {
    kind: 'csv',
    url: 'https://service.destatis.de/DE/karten/hebesaetze-gemeinden-2024/data/hebesaetze-gemeinden-2024.csv',
    title: 'Hebesätze der Gemeinden 2024 (Daten der Karte im Statistikportal)',
    publisher: 'Statistisches Bundesamt (Destatis)',
    attribution: '© Statistisches Bundesamt (Destatis), 2026',
    terms: 'Destatis-Nutzungsbedingungen: Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.',
  },
}

const NOT_OBTAINED = {
  2023: 'Nur in der Regionaldatenbank Deutschland (Tabelle 71231-01-03-5) mit Anmeldung abrufbar; die Kartendaten 2023 bietet Destatis nicht mehr an.',
  2025: 'Noch nicht veröffentlicht (Stand der Abfrage); Destatis veröffentlicht die Gemeindewerte eines Jahres im Folgejahr.',
  2026: 'Noch nicht veröffentlicht (Stand der Abfrage).',
}

// The tables name a Gemeinde with its status ("Kiel, kreisfreie Stadt, Landeshauptstadt"); the
// postal-code table names the place alone, so the name is kept up to the first comma.
const shortName = (name) => name.split(',')[0].trim()

function parseNumber(value) {
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && String(value).trim() !== '' ? n : null
}

function fromXlsx(buf) {
  const entries = []
  for (const sheet of readWorkbook(buf)) {
    // "Anhang Land …" sheets repeat the merged Gemeinden of Brandenburg, MV and Thüringen with the
    // rates of their former parts; the Land sheet already holds the weighted rate of the new Gemeinde.
    if (!/^Land \d\d /.test(sheet.name)) continue
    const header = sheet.rows.findIndex((r) => r.some((c) => /Gemeinde-\s*schlüssel/.test(c)))
    const sub = sheet.rows[header + 1]
    const iAgs = sheet.rows[header].findIndex((c) => /Gemeinde-\s*schlüssel/.test(c))
    const iName = sheet.rows[header].findIndex((c) => c.trim() === 'Gemeinde')
    const iGew = sub.findIndex((c) => c.trim() === 'Gewerbesteuer')
    for (const row of sheet.rows.slice(header + 2)) {
      const ags = row[iAgs]?.trim()
      if (!/^\d{8}$/.test(ags ?? '')) continue
      entries.push({ ags, name: row[iName], gew: row[iGew] })
    }
  }
  return entries
}

function fromCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const cells = (line) => line.split(';').map((c) => c.replace(/^"|"$/g, ''))
  const header = cells(lines[0])
  const [iAgs, iName, iGew] = ['AGS', 'Name', 'Gewerbesteuer'].map((h) => header.indexOf(h))
  if ([iAgs, iName, iGew].includes(-1)) throw new Error(`unexpected CSV header: ${header.join(';')}`)
  return lines.slice(1).map((l) => {
    const c = cells(l)
    return { ags: c[iAgs], name: c[iName], gew: c[iGew] }
  })
}

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function render(header, entries) {
  // One Gemeinde per line keeps the yearly diff readable.
  const body = entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n')
  const head = JSON.stringify(header, null, 2).replace(/\n}$/, '')
  return entries.length ? `${head},\n  "entries": [\n${body}\n  ]\n}\n` : `${JSON.stringify({ ...header, entries: [] }, null, 2)}\n`
}

const retrieved = new Date().toISOString().slice(0, 10)
const published = YEARS.filter((y) => SOURCES[y])
const outputs = new Map()
for (const year of YEARS) {
  const source = SOURCES[year]
  if (!source) {
    const fallbackYear = published.findLast((y) => y < year) ?? published.at(-1)
    outputs.set(year, render({ year, status: 'not_available', reason: NOT_OBTAINED[year], fallbackYear, retrieved }, []))
    continue
  }
  const buf = await fetchSource(source.kind === 'xlsx' ? `${source.url}?__blob=publicationFile` : source.url)
  const raw = source.kind === 'xlsx' ? fromXlsx(buf) : fromCsv(buf.toString('utf8'))
  const entries = []
  let skipped = 0
  for (const r of raw) {
    const land = LAND_BY_KEY[r.ags.slice(0, 2)]
    const hebesatz = parseNumber(r.gew)
    // Gemeindefreie Gebiete and Gemeinden without a reported rate carry no number.
    if (!land || hebesatz === null) {
      skipped += 1
      continue
    }
    entries.push({ ags: r.ags, name: shortName(r.name), land, hebesatzGewerbesteuer: hebesatz })
  }
  entries.sort((a, b) => a.ags.localeCompare(b.ags))
  if (new Set(entries.map((e) => e.ags)).size !== entries.length) throw new Error(`${year}: duplicate AGS`)
  if (entries.length < 10_000) throw new Error(`${year}: only ${entries.length} Gemeinden, expected about 10.800`)
  const lands = new Set(entries.map((e) => e.land))
  if (lands.size !== 16) throw new Error(`${year}: only ${lands.size} Länder`)
  const header = {
    year,
    status: 'published',
    source: { title: source.title, publisher: source.publisher, url: source.url, sha256: createHash('sha256').update(buf).digest('hex') },
    license: source.terms,
    attribution: source.attribution,
    retrieved,
    unit: 'Prozent',
    count: entries.length,
  }
  console.log(`[hebesaetze] ${year}: ${entries.length} Gemeinden (${skipped} rows without a rate skipped)`)
  outputs.set(year, render(header, entries))
}

const check = process.argv.includes('--check')
await mkdir(OUT_DIR, { recursive: true })
let stale = false
for (const [year, text] of outputs) {
  const file = path.join(OUT_DIR, `${year}.json`)
  if (check) {
    // The retrieval date changes every run; compare the rest.
    const strip = (s) => s.replace(/"retrieved": "[^"]*"/, '')
    const current = await readFile(file, 'utf8').catch(() => '')
    if (strip(current) !== strip(text)) {
      console.error(`[hebesaetze] ${year}.json is out of date`)
      stale = true
    }
  } else {
    await writeFile(file, text)
  }
}
if (stale) process.exit(1)
