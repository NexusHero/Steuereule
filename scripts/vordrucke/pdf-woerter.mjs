// The printed words of one Vordruck page with their boxes (poppler's pdftotext -bbox), shared by
// vermessen.mjs and lagebericht.mjs. Dev-time and CI tool, never a runtime dependency.
import { execFileSync } from 'node:child_process'

/** Words with their boxes, top-left origin, PDF points. */
export function woerter(datei, seite) {
  const xml = execFileSync('pdftotext', ['-f', String(seite), '-l', String(seite), '-bbox', datei, '-'], {
    encoding: 'utf8',
  })
  const hoehe = Number(/<page width="[\d.]+" height="([\d.]+)"/.exec(xml)[1])
  const liste = [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
    (m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5].replaceAll('&amp;', '&') }),
  )
  return { hoehe, liste }
}

