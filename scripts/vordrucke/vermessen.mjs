#!/usr/bin/env node
// Measures the Ausdruck's field boxes against the checked-in Vordruck templates (ADR-0050).
//
// Positions are never typed in by hand: every field in felder-<jahr>.spec.json names an
// anchor printed on the form (a field label, a Kennzahl, a line number), and this script
// resolves it to the white input box the form itself draws. The result is checked in as
// felder-<jahr>.json together with each template's sha256, so a swapped template cannot
// silently keep old positions (test/ausdruck-felder.test.ts).
//
// Dev-time and CI tool (job „Vordrucke“): needs poppler (`pdftotext`, `pdftocairo`), never a runtime
// dependency. The yearly procedure: docs/process/vordrucke-jahreswechsel.md.
//
//   node scripts/vordrucke/vermessen.mjs 2025          (writes felder-<jahr>.json)
//   node scripts/vordrucke/vermessen.mjs 2025 --check  (CI: fails when the checked-in file differs)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { woerter } from './pdf-woerter.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const jahr = process.argv[2]
if (!/^\d{4}$/.test(jahr ?? '')) {
  console.error('usage: node scripts/vordrucke/vermessen.mjs <jahr>')
  process.exit(1)
}
const VORLAGEN = path.join(ROOT, 'apps/api/assets/vordrucke', jahr)
const AUSDRUCK = path.join(ROOT, 'apps/api/src/ausdruck')
const spec = JSON.parse(readFileSync(path.join(AUSDRUCK, `felder-${jahr}.spec.json`), 'utf8'))

const cache = new Map()

/** White, axis-aligned filled rectangles = the form's input boxes (and tick boxes). */
function weisseKaesten(datei, seite) {
  const svg = execFileSync('pdftocairo', ['-svg', '-f', String(seite), '-l', String(seite), datei, '-'], {
    encoding: 'utf8',
  })
  const kaesten = []
  for (const m of svg.matchAll(/<path[^>]*fill="rgb\(100%, 100%, 100%\)"[^>]*d="([^"]+)"/g)) {
    const zahlen = [...m[1].matchAll(/-?[\d.]+/g)].map(Number)
    const xs = zahlen.filter((_, i) => i % 2 === 0)
    const ys = zahlen.filter((_, i) => i % 2 === 1)
    const kasten = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    // A full-page white background or a hairline is not an input box.
    if (kasten.x1 - kasten.x0 > 400 && kasten.y1 - kasten.y0 > 400) continue
    if (kasten.x1 - kasten.x0 < 5 || kasten.y1 - kasten.y0 < 5) continue
    kaesten.push(kasten)
  }
  return kaesten
}

/** Stroked straight lines (after their `matrix(a 0 0 d e f)` transform) — the outline of
 *  boxes the form draws as a frame instead of a white fill (the page-2 header). */
function linien(datei, seite) {
  const svg = execFileSync('pdftocairo', ['-svg', '-f', String(seite), '-l', String(seite), datei, '-'], {
    encoding: 'utf8',
  })
  const ergebnis = []
  for (const m of svg.matchAll(/<path fill="none"[^>]*d="M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+) Z[^"]*"(?: transform="matrix\(([^)]+)\)")?/g)) {
    const [a, , , d, e, f] = (m[5] ?? '1,0,0,1,0,0').split(',').map(Number)
    const p = (x, y) => ({ x: a * x + e, y: d * y + f })
    const von = p(+m[1], +m[2])
    const bis = p(+m[3], +m[4])
    ergebnis.push({ x0: Math.min(von.x, bis.x), y0: Math.min(von.y, bis.y), x1: Math.max(von.x, bis.x), y1: Math.max(von.y, bis.y) })
  }
  return ergebnis
}

function seitendaten(formular, seite) {
  const key = `${formular}#${seite}`
  if (!cache.has(key)) {
    const datei = path.join(VORLAGEN, `${formular}.pdf`)
    cache.set(key, { ...woerter(datei, seite), kaesten: weisseKaesten(datei, seite), linien: linien(datei, seite) })
  }
  return cache.get(key)
}

const mitte = (b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })
const ueberlappenVertikal = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2

/** The anchor word: `text` (a single printed word), disambiguated by the line number
 *  `zeile` printed in the left margin — the anchor must sit in that line's band. */
function findeAnker(daten, feld) {
  const kandidaten = daten.liste.filter((w) => w.text === feld.anker)
  if (feld.zeile === undefined) {
    if (kandidaten.length !== 1) throw new Error(`${feld.id}: anchor "${feld.anker}" found ${kandidaten.length}×, give a zeile`)
    return kandidaten[0]
  }
  const nummern = daten.liste.filter((w) => w.x1 < 62 && /^\d{1,3}$/.test(w.text))
  const zeile = nummern.find((w) => w.text === String(feld.zeile))
  if (!zeile) throw new Error(`${feld.id}: line ${feld.zeile} not printed on this page`)
  const davor = nummern.filter((w) => Number(w.text) === feld.zeile - 1)[0]
  const oben = davor ? davor.y1 : 0
  const imBand = kandidaten.filter((w) => mitte(w).y > oben && mitte(w).y < zeile.y1 + 4)
  // The same label twice in one line (Postleitzahl Inland/Ausland): `vorkommen` counts from the left.
  if (feld.vorkommen !== undefined) {
    const gewaehlt = imBand.sort((a, b) => a.x0 - b.x0)[feld.vorkommen - 1]
    if (!gewaehlt) throw new Error(`${feld.id}: anchor "${feld.anker}" has no occurrence ${feld.vorkommen} in line ${feld.zeile}`)
    return gewaehlt
  }
  if (imBand.length !== 1) throw new Error(`${feld.id}: anchor "${feld.anker}" in line ${feld.zeile} found ${imBand.length}×`)
  return imBand[0]
}

function findeKasten(daten, feld, anker) {
  const m = mitte(anker)
  if (feld.lage === 'gerahmt') {
    const senkrecht = daten.linien.filter((l) => l.x1 - l.x0 < 1 && l.y0 <= m.y && l.y1 >= m.y)
    const waagerecht = daten.linien.filter((l) => l.y1 - l.y0 < 1 && l.x0 <= m.x && l.x1 >= m.x)
    const links = senkrecht.filter((l) => l.x0 < anker.x0).sort((a, b) => b.x0 - a.x0)[0]
    const rechts = senkrecht.filter((l) => l.x0 > anker.x1).sort((a, b) => a.x0 - b.x0)[0]
    const oben = waagerecht.filter((l) => l.y0 < anker.y0).sort((a, b) => b.y0 - a.y0)[0]
    const unten = waagerecht.filter((l) => l.y0 > anker.y1).sort((a, b) => a.y0 - b.y0)[0]
    // A frame may be open on one side (the page-2 header ends on the grey area below):
    // the missing edge is where its side lines end.
    if (!links || !rechts || (!oben && !unten)) throw new Error(`${feld.id}: no frame around "${feld.anker}"`)
    return {
      x0: links.x0,
      x1: rechts.x0,
      y0: oben ? oben.y0 : Math.max(links.y0, rechts.y0),
      y1: unten ? unten.y0 : Math.min(links.y1, rechts.y1),
    }
  }
  if (feld.lage === 'unter') {
    // Field labels sit in their own small white tab overlapping the box's top edge:
    // the field is the widest white box starting just below the label's top, under it.
    const treffer = daten.kaesten
      .filter((k) => k.x0 <= anker.x0 && k.x1 >= anker.x1)
      .filter((k) => k.y0 > anker.y0 && k.y0 < anker.y1 + 12)
      .sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))
    if (treffer.length === 0) throw new Error(`${feld.id}: no white box under "${feld.anker}"`)
    return treffer[0]
  }
  if (feld.lage === 'in') {
    const treffer = daten.kaesten.filter((k) => m.x >= k.x0 && m.x <= k.x1 && m.y >= k.y0 && m.y <= k.y1)
    if (treffer.length === 0) throw new Error(`${feld.id}: no white box contains "${feld.anker}"`)
    return treffer.sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0]
  }
  const seitlich = daten.kaesten
    .filter((k) => ueberlappenVertikal(k, anker))
    .filter((k) => (feld.lage === 'rechts' ? k.x0 >= anker.x1 - 1 : k.x1 <= anker.x0 + 1))
    .sort((a, b) => (feld.lage === 'rechts' ? a.x0 - b.x0 : b.x1 - a.x1))
  // Two boxes behind one Kennzahl (vom / bis): `nr` counts outward from the anchor.
  const nr = feld.nr ?? 1
  if (seitlich.length < nr) throw new Error(`${feld.id}: no white box no. ${nr} ${feld.lage} of "${feld.anker}"`)
  return seitlich[nr - 1]
}

const vorlagen = {}
const felder = spec.felder.map((feld) => {
  const daten = seitendaten(feld.formular, feld.seite)
  const kasten = findeKasten(daten, feld, findeAnker(daten, feld))
  // Stored bottom-left origin (pdf-lib's coordinate system), rounded to 0.1 pt.
  const r = (v) => Math.round(v * 10) / 10
  // Pre-printed text inside the box (the "D E" of the domestic IBAN, the page-2 header's
  // label and page number): writing starts after its rightmost occurrence.
  let textAb
  if (feld.beginnNach) {
    const vorgedruckt = daten.liste.filter(
      (w) => w.text === feld.beginnNach && w.x0 >= kasten.x0 && w.x1 <= kasten.x1 && mitte(w).y >= kasten.y0 && mitte(w).y <= kasten.y1,
    )
    if (vorgedruckt.length === 0) throw new Error(`${feld.id}: "${feld.beginnNach}" not printed in its box`)
    textAb = r(Math.max(...vorgedruckt.map((w) => w.x1)) + 4)
  }
  vorlagen[feld.formular] ??= createHash('sha256')
    .update(readFileSync(path.join(VORLAGEN, `${feld.formular}.pdf`)))
    .digest('hex')
  return {
    id: feld.id,
    formular: feld.formular,
    seite: feld.seite,
    art: feld.art,
    kasten: { x: r(kasten.x0), y: r(daten.hoehe - kasten.y1), breite: r(kasten.x1 - kasten.x0), hoehe: r(kasten.y1 - kasten.y0) },
    ...(textAb === undefined ? {} : { textAb }),
  }
})

const ziel = path.join(AUSDRUCK, `felder-${jahr}.json`)
const inhalt = JSON.stringify({ jahr: Number(jahr), vorlagen, felder }, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(ziel, 'utf8') !== inhalt) {
    console.error(`felder-${jahr}.json is not what the templates and the spec measure — run vermessen.mjs ${jahr} and review the diff.`)
    process.exit(1)
  }
  console.log(`${felder.length} Felder: felder-${jahr}.json stimmt mit Vorlagen und Spec überein.`)
} else {
  writeFileSync(ziel, inhalt)
  console.log(`${felder.length} Felder vermessen → apps/api/src/ausdruck/felder-${jahr}.json`)
}
