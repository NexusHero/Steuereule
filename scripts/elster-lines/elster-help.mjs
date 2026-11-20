// Reads the official ELSTER form help ("Anleitung zur Gewerbesteuererklärung <Jahr>" on elster.de)
// for forms that have no public PDF. The help is organised by field, not by Zeile: each field is a
// collapsible box with a stable HTML id and its official title. So these entries carry the label
// and no Zeile (`zeile: null`); the app can still say which field in Mein ELSTER to fill.
//
// The page embeds per-request tokens (CSRF, session), so its hash changes on every download; the
// SHA-256 recorded is that of the extracted help text, which only changes with the content.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const UA = 'Mozilla/5.0 (compatible; steuereule-formulare/1.0)'

export const HELP_SOURCES = {
  gewst: Object.fromEntries(
    [2022, 2023, 2024, 2025, 2026].map((y) => [y, `https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_${y}`]),
  ),
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim()

/** `{ boxes: Map(id → title), text, title }` of one help page, or null when ELSTER has no such page. */
export function parseHelp(html) {
  const title = /Anleitung zur Gewerbesteuererklärung \d{4}/.exec(decode(html))?.[0]
  if (!title) return null
  const boxes = new Map()
  for (const m of html.matchAll(/id="([^"]+)"\s*>\s*<h\d class="toggleBox__head">[\s\S]*?toggleBox__title">([\s\S]*?)<\/span>/g)) {
    if (!boxes.has(m[1])) boxes.set(m[1], decode(m[2]))
  }
  const start = html.indexOf('toggleBox')
  const text = decode(html.slice(start))
  return { title, boxes, text }
}

/** Fetches (or reads from the cache) every help page; returns `{ form, year, url, help, sha256 }`. */
export async function ensureHelp(cacheDir) {
  const out = []
  for (const [form, years] of Object.entries(HELP_SOURCES)) {
    for (const [year, url] of Object.entries(years)) {
      const file = path.join(cacheDir, `help-${form}`, `${year}.html`)
      let html = await readFile(file, 'utf8').catch(() => null)
      if (!html) {
        const res = await fetch(url, { headers: { 'user-agent': UA } })
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
        html = await res.text()
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, html)
      }
      const help = parseHelp(html)
      // ELSTER answers an unknown year with its generic help page; that year is not published.
      if (!help) continue
      out.push({ form, year: Number(year), url, help, sha256: createHash('sha256').update(help.text).digest('hex') })
    }
  }
  return out
}
