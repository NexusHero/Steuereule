#!/usr/bin/env node
// Builds the PLZ → Finanzamt table shipped in @steuereule/core: the suggestion under the
// "Zuständiges Finanzamt" field of the Stammdaten.
//
// Source: the GemFA XML export of the Bundeszentralamt für Steuern (BZSt), "GEMeinden und
// FinanzAemter", refreshed there on the 1st and 15th of each month:
// https://www.bzst.de/DE/Service/Behoerdenwegweiser/Finanzamtsuche/finanzamtsuche_node.html
//
// How a postal code gets its offices:
//   1. Where the BZSt lists address-level responsibilities for the postal code (the cities with
//      several Finanzämter: Berlin, Hamburg, Köln, …), the offices named there.
//   2. Otherwise the offices of every Gemeinde that has the postal code.
// The street and house-number ranges of (1) are NOT shipped (about 100.000 rows): a postal code
// split between offices yields several suggestions and the user picks. More than MAX_OFFICES
// would be a list, not a suggestion — such postal codes get none.
//
// Run when the data should be refreshed and commit the result:
//   node scripts/finanzamt-data/build-tax-offices.mjs             # downloads the export
//   node scripts/finanzamt-data/build-tax-offices.mjs --source ./gemfa_xml_export_datei.zip
//
// The app never fetches this data at runtime: the table is bundled, the lookup stays on the device.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const SOURCE_URL = 'https://www.bzst.de/SharedDocs/Downloads/DE/GemFA/gemfa_xml_export_datei.zip?__blob=publicationFile'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '../../packages/core/src/common/tax-offices.data.ts')
const POSTAL_CODES = path.resolve(HERE, '../../packages/core/src/common/postal-codes.data.ts')
const MAX_OFFICES = 4

function fail(message) {
  console.error(`[finanzamt-data] FAIL — ${message}`)
  process.exit(1)
}

async function loadZip() {
  const i = process.argv.indexOf('--source')
  if (i !== -1) return readFile(process.argv[i + 1])
  console.log(`[finanzamt-data] downloading ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) fail(`download failed: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** The export is a zip with exactly one deflated XML file; its sizes are in the central directory. */
function unzipSingleFile(zip) {
  let end = zip.length - 22
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0) fail('not a zip file (no end-of-central-directory record)')
  if (zip.readUInt16LE(end + 10) !== 1) fail('expected exactly one file in the export zip')
  const central = zip.readUInt32LE(end + 16)
  const compressedSize = zip.readUInt32LE(central + 20)
  const nameLength = zip.readUInt16LE(central + 28)
  const name = zip.toString('utf8', central + 46, central + 46 + nameLength)
  const local = zip.readUInt32LE(central + 42)
  const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
  return { name, xml: inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize)).toString('utf8') }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (value) =>
  value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, code) =>
    code[0] === '#' ? String.fromCodePoint(code[1] === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : (ENTITIES[code] ?? whole),
  )
const attribute = (tag, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match ? decode(match[1]) : null
}
/** A top-level list of the export. Lists of the same name are nested inside, so the end is the next top-level list. */
const section = (xml, name, next) => {
  const from = xml.indexOf(`<${name}>`)
  const to = next ? xml.indexOf(`<${next}>`, from) : xml.length
  if (from === -1 || to === -1) fail(`section ${name} missing in the export`)
  return xml.slice(from, to)
}
/** Splits a section into the blocks that start with an element carrying `idAttribute`. */
function blocks(text, element, idAttribute) {
  const starts = [...text.matchAll(new RegExp(`<${element}\\s[^>]*${idAttribute}="[^"]*"[^>]*>`, 'g'))]
  return starts.map((match, i) => ({ tag: match[0], body: text.slice(match.index, starts[i + 1]?.index ?? text.length) }))
}

const { name: exportName, xml } = unzipSingleFile(await loadZip())

/** Finanzamt id → name, and Gemeinde id → the offices responsible for it. */
const officeName = new Map()
const officesOfMunicipality = new Map()
for (const { tag, body } of blocks(section(xml, 'FinanzamtListe', 'VorgesetzteFinanzbehoerdeListe'), 'Finanzamt', 'FinanzbehoerdeId')) {
  const id = attribute(tag, 'FinanzbehoerdeId')
  officeName.set(id, attribute(tag, 'Name'))
  for (const ref of body.matchAll(/\sGemeindeRef="([^"]*)"/g)) {
    const list = officesOfMunicipality.get(ref[1]) ?? []
    list.push(id)
    officesOfMunicipality.set(ref[1], list)
  }
}

/** PLZ → office ids, from the Gemeinden that have the postal code. */
const byMunicipality = new Map()
for (const { tag, body } of blocks(section(xml, 'BundeslandListe', 'AdressezustaendigkeitListe'), 'Gemeinde', 'GemeindeId')) {
  const offices = officesOfMunicipality.get(attribute(tag, 'GemeindeId')) ?? []
  const postalCodes = new Set([attribute(tag, 'PLZ'), ...[...body.matchAll(/<Ort\s[^>]*>/g)].map((ort) => attribute(ort[0], 'PLZ'))])
  for (const plz of postalCodes) {
    if (!plz) continue
    const set = byMunicipality.get(plz) ?? new Set()
    for (const office of offices) set.add(office)
    byMunicipality.set(plz, set)
  }
}

/** PLZ → office ids, from the address-level responsibilities. These win over the Gemeinde. */
const byAddress = new Map()
for (const match of section(xml, 'AdressezustaendigkeitListe', null).matchAll(/<Adressezustaendigkeit\s[^>]*>/g)) {
  const plz = attribute(match[0], 'PLZ')
  const office = attribute(match[0], 'FinanzamtRef')
  if (!plz || !office) continue
  const set = byAddress.get(plz) ?? new Set()
  set.add(office)
  byAddress.set(plz, set)
}

// Only postal codes of real addresses: the export also carries PO-box and bulk-customer codes.
const knownPostalCodes = [...(await readFile(POSTAL_CODES, 'utf8')).matchAll(/(?:"|\\n)(\d{5})=/g)].map((m) => m[1])
if (knownPostalCodes.length < 8000) fail(`could not read the postal codes from ${POSTAL_CODES}`)

const names = []
const nameIndex = new Map()
const indexOf = (name) => {
  if (/[|=\n,]/.test(name)) fail(`office name ${JSON.stringify(name)} contains a separator`)
  if (!nameIndex.has(name)) {
    nameIndex.set(name, names.length)
    names.push(name)
  }
  return nameIndex.get(name)
}

let unknown = 0
let tooMany = 0
const undefinedOffices = new Set()
const lines = []
for (const plz of knownPostalCodes.sort()) {
  const ids = [...(byAddress.get(plz) ?? byMunicipality.get(plz) ?? [])]
  for (const id of ids) if (!officeName.get(id)) undefinedOffices.add(id)
  // Two offices may share a name (a main office and its branch): one suggestion is enough.
  const offices = [...new Set(ids.map((id) => officeName.get(id)).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de'))
  if (offices.length === 0) {
    unknown += 1
    continue
  }
  if (offices.length > MAX_OFFICES) {
    tooMany += 1
    continue
  }
  lines.push(`${plz}=${offices.map((name) => indexOf(name).toString(36)).join(',')}`)
}
if (undefinedOffices.size > 0) fail(`offices referenced but not defined: ${[...undefinedOffices].slice(0, 8).join(', ')}`)

// Plausibility: the export covers all of Germany, so nearly every postal code must get an office.
if (officeName.size < 500 || officeName.size > 700) fail(`expected about 600 Finanzämter, got ${officeName.size}`)
if (lines.length < knownPostalCodes.length * 0.95) fail(`only ${lines.length} of ${knownPostalCodes.length} postal codes got an office`)

const exportDate = /(\d{4})(\d{2})(\d{2})/.exec(exportName)
const stand = exportDate ? `${exportDate[3]}.${exportDate[2]}.${exportDate[1]}` : 'unbekannt'
const retrieved = new Date().toISOString().slice(0, 10)
const body = `// GENERATED by scripts/finanzamt-data/build-tax-offices.mjs — do not edit by hand.
//
// Source: Bundeszentralamt für Steuern (BZSt), GemFA XML export ${exportName}, retrieved ${retrieved}.
// https://www.bzst.de/DE/Service/Behoerdenwegweiser/Finanzamtsuche/finanzamtsuche_node.html
// Postal codes with a suggestion: ${lines.length}; without an office in the export: ${unknown};
// with more than ${MAX_OFFICES} possible offices (no suggestion): ${tooMany}.
//
// TAX_OFFICE_NAMES: office names as the BZSt writes them, separated by \`|\`.
// TAX_OFFICE_TABLE: one line per postal code, \`PLZ=i,j\` — base-36 indexes into the names.

export const TAX_OFFICE_SOURCE = { name: 'Bundeszentralamt für Steuern, GemFA', stand: '${stand}', retrieved: '${retrieved}' } as const

export const TAX_OFFICE_NAMES = ${JSON.stringify(names.join('|'))}

export const TAX_OFFICE_TABLE = ${JSON.stringify(lines.join('\n'))}
`
await writeFile(OUT, body)
console.log(`[finanzamt-data] ${lines.length} postal codes, ${names.length} offices, ${unknown} unknown, ${tooMany} skipped → ${OUT} (${body.length} bytes)`)
