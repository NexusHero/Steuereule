#!/usr/bin/env node
// Year change helper for the Vordrucke (docs/process/vordrucke-jahreswechsel.md, step 3): the forms
// renumber their lines from year to year, and a line number that exists in both years may mean another
// line. For every field of the old year's spec this finds the line of the new year's form whose printed
// text matches, and rewrites `zeile` (and `seite`, and an anchor that is the line number itself) in the
// new spec. It never invents positions: vermessen.mjs still measures, and the Lagebericht is still read.
//
//   node scripts/vordrucke/zeilen-abgleich.mjs 2025 2024   (rewrites felder-2024.spec.json, lists the moves)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { woerter } from './pdf-woerter.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const [von, nach] = process.argv.slice(2)
if (!/^\d{4}$/.test(von ?? '') || !/^\d{4}$/.test(nach ?? '')) {
  console.error('usage: node scripts/vordrucke/zeilen-abgleich.mjs <from-year> <to-year>')
  process.exit(1)
}
const AUSDRUCK = path.join(ROOT, 'apps/api/src/printout')
const vorlage = (jahr, formular) => path.join(ROOT, 'apps/api/assets/vordrucke', jahr, `${formular}.pdf`)

const cache = new Map()
/** The printed text of every numbered line of a form: line number → words beside it, per page. */
function zeilen(jahr, formular) {
  const key = `${jahr}#${formular}`
  if (cache.has(key)) return cache.get(key)
  const result = []
  for (let seite = 1; seite <= 12; seite++) {
    let daten
    try {
      daten = woerter(vorlage(jahr, formular), seite)
    } catch {
      break
    }
    if (daten.liste.length === 0) break
    const nummern = daten.liste.filter((w) => w.x1 < 62 && /^\d{1,3}$/.test(w.text)).sort((a, b) => a.y0 - b.y0)
    nummern.forEach((nr, i) => {
      // The band of a line ends at the line above, at most two text lines up (the page header is no line).
      const oben = Math.max(i > 0 ? nummern[i - 1].y1 : 0, nr.y0 - 30)
      const text = daten.liste
        .filter((w) => w.x0 >= 62 && (w.y0 + w.y1) / 2 > oben && (w.y0 + w.y1) / 2 < nr.y1 + 4)
        .map((w) => w.text.toLowerCase())
        .filter((t) => /[a-zäöüß]{3,}|^\d{2,3}$/.test(t))
      result.push({ seite, zeile: Number(nr.text), woerter: new Set(text) })
    })
  }
  cache.set(key, result)
  return result
}

const aehnlich = (a, b) => {
  const gemeinsam = [...a].filter((w) => b.has(w)).length
  return gemeinsam / Math.max(1, new Set([...a, ...b]).size)
}

const ziel = path.join(AUSDRUCK, `felder-${nach}.spec.json`)
let text = readFileSync(ziel, 'utf8')
const spec = JSON.parse(text)

// Pass 1: every field whose line text has one clear match; the offsets per form and page tell where the
// lines without text of their own (blank „Sonstiges“ lines) and the twins (1. and 2. Angabe) went.
const beurteilt = spec.felder.filter((f) => f.zeile !== undefined).map((feld) => {
  const alt = zeilen(von, feld.formular).find((z) => z.seite === feld.seite && z.zeile === feld.zeile)
  if (!alt) return { feld, art: 'fehlt' }
  const kandidaten = zeilen(nach, feld.formular)
    .map((z) => ({ ...z, score: aehnlich(alt.woerter, z.woerter) }))
    .sort((a, b) => b.score - a.score)
  const best = kandidaten[0]
  if (!best || best.score < 0.5) return { feld, art: 'leer', kandidaten }
  const gleich = kandidaten.filter((k) => k.score === best.score)
  return gleich.length > 1 ? { feld, art: 'zwilling', kandidaten: gleich } : { feld, art: 'klar', best }
})
/**
 * Where a field is expected in the new year: like its nearest clearly matched neighbour on the same old page
 * (same page shift, same line offset). Offsets change within a page when a line is added in the middle, so
 * the nearest neighbours count, not the page as a whole.
 */
function erwartet(feld) {
  const nahe = beurteilt
    .filter((b) => b.art === 'klar' && b.feld.formular === feld.formular && b.feld.seite === feld.seite && b.feld.zeile !== feld.zeile)
    .sort((a, b) => Math.abs(a.feld.zeile - feld.zeile) - Math.abs(b.feld.zeile - feld.zeile))
  const n = nahe[0]
  return n ? { seite: n.best.seite, zeile: feld.zeile + (n.best.zeile - n.feld.zeile) } : { seite: feld.seite, zeile: feld.zeile }
}
const nah = (k, soll) => k.seite === soll.seite && Math.abs(k.zeile - soll.zeile) <= 3
const moves = []
const unsicher = []
for (const b of beurteilt) {
  const feld = b.feld
  let ziel2 = null
  let wie = 'Text'
  if (b.art === 'klar') {
    // A clear match far from where the neighbours went (another page, the page head) only stands when
    // nothing near the expected place fits about as well.
    const soll = erwartet(feld)
    const naheKandidat = zeilen(nach, feld.formular)
      .filter((z) => nah(z, soll))
      .map((z) => ({ ...z, score: aehnlich(zeilen(von, feld.formular).find((x) => x.seite === feld.seite && x.zeile === feld.zeile).woerter, z.woerter) }))
      .sort((x, y) => y.score - x.score || Math.abs(x.zeile - soll.zeile) - Math.abs(y.zeile - soll.zeile))[0]
    ziel2 = !nah(b.best, soll) && naheKandidat && naheKandidat.score >= 0.4 ? naheKandidat : b.best
    if (ziel2 !== b.best) wie = 'nächste passende Zeile beim Nachbarn'
  } else if (b.art === 'zwilling') {
    const soll = erwartet(feld)
    ziel2 = [...b.kandidaten].sort((a, c) => Number(!nah(a, soll)) - Number(!nah(c, soll)) || Math.abs(a.zeile - soll.zeile) - Math.abs(c.zeile - soll.zeile))[0] ?? null
    if (ziel2 && !nah(ziel2, soll)) ziel2 = null
    wie = 'Zwilling, Nachbarversatz'
  } else if (b.art === 'leer') {
    const soll = erwartet(feld)
    ziel2 = zeilen(nach, feld.formular).find((z) => z.seite === soll.seite && z.zeile === soll.zeile) ?? null
    wie = 'ohne Text, Nachbarversatz'
  }
  if (ziel2 === null) {
    if (b.art !== 'fehlt') unsicher.push(`${feld.id}: Zeile ${feld.zeile} (${b.art}) nicht zuzuordnen`)
    continue
  }
  if (ziel2.zeile === feld.zeile && ziel2.seite === feld.seite) continue
  if (wie !== 'Text') unsicher.push(`${feld.id}: ${feld.seite}/${feld.zeile} → ${ziel2.seite}/${ziel2.zeile} nach ${wie} — im Lagebericht prüfen`)
  moves.push({ id: feld.id, von: `${feld.seite}/${feld.zeile}`, nach: `${ziel2.seite}/${ziel2.zeile}` })
  // One field per line in the spec: rewrite that line only.
  const lines = text.split('\n')
  const at = lines.findIndex((l) => l.includes(`"id": "${feld.id}"`))
  let l = lines[at]
  if (feld.anker === String(feld.zeile)) l = l.replace(`"anker": "${feld.zeile}"`, `"anker": "${ziel2.zeile}"`)
  l = l.replace(`"zeile": ${feld.zeile}`, `"zeile": ${ziel2.zeile}`).replace(`"seite": ${feld.seite}`, `"seite": ${ziel2.seite}`)
  lines[at] = l
  text = lines.join('\n')
}
writeFileSync(ziel, text)
for (const m of moves) console.log(`${m.id}: ${m.von} → ${m.nach}`)
for (const u of unsicher) console.error(`prüfen: ${u}`)
console.log(`${moves.length} Felder verschoben, ${unsicher.length} zum Prüfen → felder-${nach}.spec.json`)
