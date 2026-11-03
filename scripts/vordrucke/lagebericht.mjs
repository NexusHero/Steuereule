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
//   node scripts/vordrucke/lagebericht.mjs 2025          (writes felder-<jahr>.lage.txt)
//   node scripts/vordrucke/lagebericht.mjs 2025 --check  (CI: fails when the report changed)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { woerter } from './pdf-woerter.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const jahr = process.argv[2]
if (!/^\d{4}$/.test(jahr ?? '')) {
  console.error('usage: node scripts/vordrucke/lagebericht.mjs <jahr> [--check]')
  process.exit(1)
}
const VORLAGEN = path.join(ROOT, 'apps/api/assets/vordrucke', jahr)
const AUSDRUCK = path.join(ROOT, 'apps/api/src/ausdruck')
const { felder } = JSON.parse(readFileSync(path.join(AUSDRUCK, `felder-${jahr}.json`), 'utf8'))

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
  const zeile = zeilen[0] ? `Z${zeilen[0].text}` : 'Kopf'

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

  return `${feld.id.padEnd(30)} S${feld.seite} ${zeile.padEnd(5)} ↑ ${kurz(spalte, 28).padEnd(28)} ← ${kurz(links, 90)}`
}

const bericht =
  `# Lage der Ausdruck-Felder ${jahr} — erzeugt von scripts/vordrucke/lagebericht.mjs, nicht von Hand ändern.\n` +
  `# Feld-ID · Seite · Zeile · ↑ Spaltenkopf über dem Kasten · ← Beschriftung links daneben\n` +
  felder.map(lage).join('\n') +
  '\n'

const ziel = path.join(AUSDRUCK, `felder-${jahr}.lage.txt`)
if (process.argv.includes('--check')) {
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
  console.log(`${felder.length} Felder → apps/api/src/ausdruck/felder-${jahr}.lage.txt`)
}
