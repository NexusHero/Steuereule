#!/usr/bin/env node
// What each measured field box sits next to on the real Vordruck: its line number, the printed
// label to its left (or above it), and the column heading over it (EUR / CHF / vom / bis …).
//
// vermessen.mjs proves a box belongs to its anchor; it cannot prove the anchor was the right one
// — Anlage V once wrote the rent into the description field of Zeile 14 with a perfectly
// resolved anchor. This report makes the meaning reviewable: it is checked in next to the field
// set, read by a human once, and CI fails on any change until the new report is reviewed too.
//
// Dev-time and CI tool, needs poppler (`pdftotext`).
//
// The same reading, as data, is felder-<jahr>.zeilen.json: per field its Zeile, the Kennzahl printed in
// that line and the line's official label. The ELSTER fill-in help (ADR-0101 §16) names the lines from
// it, so it can never disagree with where the printout writes.
//
//   node scripts/vordrucke/lagebericht.mjs 2025          (writes felder-<jahr>.lage.txt and .zeilen.json)
//   node scripts/vordrucke/lagebericht.mjs 2025 --check  (CI: fails when the report or the line data changed)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { woerter } from './pdf-woerter.mjs'
import { parsePage } from '../elster-lines/pdf-lines.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const jahrArgument = process.argv[2] ?? ''
if (!/^[1-9]\d{3}$/.test(jahrArgument)) {
  console.error('usage: node scripts/vordrucke/lagebericht.mjs <jahr> [--check]')
  process.exit(1)
}
// Rebuilt from the number, so the file names below can only ever carry four digits.
const jahr = String(Number(jahrArgument))
const VORLAGEN = path.join(ROOT, 'apps/api/assets/vordrucke', jahr)
const AUSDRUCK = path.join(ROOT, 'apps/api/src/printout')
const { felder } = JSON.parse(readFileSync(path.join(AUSDRUCK, `felder-${jahr}.json`), 'utf8'))
const spec = new Map(JSON.parse(readFileSync(path.join(AUSDRUCK, `felder-${jahr}.spec.json`), 'utf8')).felder.map((f) => [f.id, f]))

const cache = new Map()
function seite(formular, nr) {
  const key = `${formular}#${nr}`
  if (!cache.has(key)) cache.set(key, woerter(path.join(VORLAGEN, `${formular}.pdf`), nr))
  return cache.get(key)
}

const mitteY = (w) => (w.y0 + w.y1) / 2
const mitteX = (w) => (w.x0 + w.x1) / 2
const istZeilennummer = (w) => w.x1 < 62 && /^\d{1,3}$/.test(w.text)
const kurz = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function lage(feld) {
  const { hoehe, liste } = seite(feld.formular, feld.seite)
  const k = feld.kasten
  const box = { x0: k.x, x1: k.x + k.breite, y0: hoehe - (k.y + k.hoehe), y1: hoehe - k.y }

  const zeilen = liste.filter((w) => istZeilennummer(w) && mitteY(w) > box.y0 - 8 && mitteY(w) < box.y1 + 8)
  // Line numbers sit in the left margin; a label starting with a number ("50 % der …") sits right of it.
  zeilen.sort((a, b) => a.x0 - b.x0 || Math.abs(mitteY(a) - mitteY(box)) - Math.abs(mitteY(b) - mitteY(box)))

  const links = liste
    .filter((w) => !istZeilennummer(w) && w.x1 <= box.x0 + 1 && mitteY(w) > box.y0 - 10 && mitteY(w) < box.y1 + 3)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    .map((w) => w.text)
    .join(' ')

  const ueber = liste
    .filter((w) => mitteX(w) >= box.x0 && mitteX(w) <= box.x1 && w.y1 <= box.y0 + 2 && w.y1 >= box.y0 - 40)
    .sort((a, b) => b.y1 - a.y1)
  const zeileUeber = ueber.length > 0 ? ueber.filter((w) => Math.abs(w.y1 - ueber[0].y1) < 2).sort((a, b) => a.x0 - b.x0) : []
  const spalte = zeileUeber.map((w) => w.text).join(' ')

  return { zeile: zeilen[0]?.text ?? null, nummer: zeilen[0] ?? null, spalte, links }
}

const zeileText = (feld, l) => `${feld.id.padEnd(30)} S${feld.seite} ${(l.zeile ? `Z${l.zeile}` : 'Kopf').padEnd(5)} ↑ ${kurz(l.spalte, 28).padEnd(28)} ← ${kurz(l.links, 90)}`

const zeilenCache = new Map()
/** The official lines of a page as the ELSTER line catalogue reads them (label, Kennzahlen). */
function amtlicheZeilen(formular, nr) {
  const key = `${formular}#${nr}`
  if (!zeilenCache.has(key)) {
    const { liste } = seite(formular, nr)
    zeilenCache.set(key, parsePage(liste.map((w) => ({ x: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, text: w.text }))))
  }
  return zeilenCache.get(key)
}

const KENNZAHL = /^\d{2,3}(?:\/\d{3})?$/

/**
 * The Kennzahl of a field, only where the form prints it in the field's own line: the anchor itself
 * when it is a Kennzahl (vermessen.mjs found it in that line), else the number in the field id when
 * that number is printed in the line (2023 prints Kz 280/480 where the id says kz280). Never guessed.
 */
function kennzahlen(feld, l) {
  const s = spec.get(feld.id)
  if (l.zeile === null) return []
  if (KENNZAHL.test(s.anker) && s.anker !== l.zeile) return [s.anker]
  const ausId = /\.kz(\d{2,3})/.exec(feld.id)?.[1]
  if (!ausId) return []
  const { liste } = seite(feld.formular, feld.seite)
  const nummern = liste.filter(istZeilennummer)
  const davor = nummern.find((w) => Number(w.text) === Number(l.zeile) - 1)
  const oben = davor ? davor.y1 : l.nummer.y0 - 40
  const imBand = liste.filter((w) => mitteY(w) > oben && mitteY(w) < l.nummer.y1 + 4 && !istZeilennummer(w))
  const gedruckt = imBand.find((w) => w.text === ausId || w.text.startsWith(`${ausId}/`))
  return gedruckt ? [gedruckt.text] : []
}

/** Left-hand text without the Kennzahlen, signs and amount marks printed around the box („01 = Summe“). */
const ohneZeichen = (text) =>
  text
    .split(' ')
    .filter((w) => !/^(\d+(\/\d+)?|[=+−–-]+|,[–-]*|,|EUR|CHF)$/.test(w))
    .join(' ')
    .trim()

/**
 * Column headings that name what a box holds when one line has several boxes (vom / bis, CHF / EUR,
 * Hausnummer / Hausnummerzusatz). Any other text over a box is the tail of a neighbouring label.
 */
const SPALTE = /^(vom|bis|CHF|EUR( \(ggf\. umgerechnet \*?\))?|Geburtsdatum|Hausnummerzusatz|Hausnummer|Identifikationsnummer|IdNr\.|Name|Vorname|Ort|Postleitzahl( \(Inland\))?|Wohnfläche \(in m²\)|Verwitwet seit dem|aufgehoben seit dem|\(Tag der Trennung\)|Dienstreisetage|Arbeitstage je Woche|PLZ, Ort und Straße|Einzelangaben.*|Bezeichnung.*|Art der .*|Name \(im Fall der Abtretung.*)$/

const proZeile = new Map()
for (const f of felder) {
  const key = `${f.formular}#${f.seite}#${lage(f).zeile}`
  proZeile.set(key, (proZeile.get(key) ?? 0) + 1)
}

function zeilenDaten(feld, l) {
  const zeilen = l.zeile === null ? [] : amtlicheZeilen(feld.formular, feld.seite).filter((z) => z.zeile === l.zeile)
  const amtlich = zeilen[0]
  const eigen = amtlich && !/^[\d\s]*$/.test(amtlich.label) ? amtlich.label : ''
  // A line without its own text (Name, Vorname; a sum printed beside its box) is named by the heading
  // over it, then by the text beside the box, then by the column.
  const label = eigen || amtlich?.headings.at(-1) || ohneZeichen(l.links) || l.spalte || ''
  const geteilt = (proZeile.get(`${feld.formular}#${feld.seite}#${l.zeile}`) ?? 0) > 1
  const spalte = geteilt && SPALTE.test(l.spalte) && l.spalte !== label ? l.spalte : null
  return { id: feld.id, formular: feld.formular, seite: feld.seite, zeile: l.zeile, kennzahlen: kennzahlen(feld, l), label, spalte }
}

const bericht =
  `# Lage der Ausdruck-Felder ${jahr} — erzeugt von scripts/vordrucke/lagebericht.mjs, nicht von Hand ändern.\n` +
  `# Feld-ID · Seite · Zeile · ↑ Spaltenkopf über dem Kasten · ← Beschriftung links daneben\n` +
  felder.map((f) => zeileText(f, lage(f))).join('\n') +
  '\n'
const zeilenJson = JSON.stringify({ jahr: Number(jahr), felder: felder.map((f) => zeilenDaten(f, lage(f))) }, null, 2) + '\n'

const ziel = path.join(AUSDRUCK, `felder-${jahr}.lage.txt`)
const zielZeilen = path.join(AUSDRUCK, `felder-${jahr}.zeilen.json`)
if (process.argv.includes('--check')) {
  let alteZeilen = ''
  try {
    alteZeilen = readFileSync(zielZeilen, 'utf8')
  } catch {
    // missing: reported below like a changed file
  }
  if (alteZeilen !== zeilenJson) {
    console.error(`felder-${jahr}.zeilen.json differs from what templates and spec give — regenerate it and review the lines it names.`)
    process.exit(1)
  }
  const alt = readFileSync(ziel, 'utf8')
  if (alt !== bericht) {
    const vorher = new Set(alt.split('\n'))
    const geaendert = bericht.split('\n').filter((zeile) => !vorher.has(zeile))
    console.error(`felder-${jahr}.lage.txt changed — review where these fields now sit, then regenerate:\n${geaendert.join('\n')}`)
    process.exit(1)
  }
  console.log(`${felder.length} Felder: Lagebericht ${jahr} unverändert.`)
} else {
  writeFileSync(ziel, bericht)
  writeFileSync(zielZeilen, zeilenJson)
  console.log(`${felder.length} Felder → apps/api/src/printout/felder-${jahr}.lage.txt, felder-${jahr}.zeilen.json`)
}
