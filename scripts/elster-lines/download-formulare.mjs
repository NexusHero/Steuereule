#!/usr/bin/env node
// Fetches the BMF letters the ELSTER fill-in help is read from (ADR-0101 §16) into a local cache
// outside git and checks each against the SHA-256 pinned in sources.mjs. The letters stay out of the
// repo: they run to 40 pages each, and only the extracted lines are needed.
//
//   node scripts/elster-lines/download-formulare.mjs [--out <dir>]
//
// A letter the BMF has taken down is fetched from the Internet Archive capture of the same address.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES } from './sources.mjs'

const UA = 'Mozilla/5.0 (compatible; steuereule-formulare/1.0)'
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DEFAULT_CACHE = path.join(os.tmpdir(), 'steuereule-formulare')

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const isPdf = (buf) => buf.subarray(0, 4).toString('latin1') === '%PDF'

async function fetchPdf(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return isPdf(buf) ? buf : null
}

// The archive keys captures by the full address including the BMF's `?__blob=...&v=n` suffix, and
// some captures of the bare address are HTML error pages; only a captured PDF counts.
async function archivedPdfUrl(url) {
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&matchType=prefix&fl=timestamp,original,mimetype,statuscode&limit=50`
  const res = await fetch(cdx, { headers: { 'user-agent': UA } })
  if (!res.ok) return null
  for (const row of (await res.text()).split('\n')) {
    const [timestamp, original, mimetype, status] = row.split(' ')
    if (mimetype === 'application/pdf' && status === '200') return `https://web.archive.org/web/${timestamp}id_/${original}`
  }
  return null
}

/** Returns the local path of every source PDF, downloading BMF letters that are not cached yet. */
export async function ensureSources(cacheDir = DEFAULT_CACHE) {
  const out = []
  for (const [form, years] of Object.entries(SOURCES)) {
    for (const [year, source] of Object.entries(years)) {
      if (source.kind === 'repo') {
        out.push({ form, year: Number(year), file: path.join(ROOT, source.file), source, servedBy: 'repo' })
        continue
      }
      const file = path.join(cacheDir, form, `${year}.pdf`)
      let buf = await readFile(file).catch(() => null)
      let servedBy = 'cache'
      if (!buf) {
        buf = await fetchPdf(`${source.url}?__blob=publicationFile`)
        servedBy = source.url
        if (!buf) {
          const capture = await archivedPdfUrl(source.url)
          buf = capture ? await fetchPdf(capture) : null
          servedBy = capture
        }
        if (!buf) throw new Error(`${form} ${year}: no PDF at ${source.url} nor in the archive`)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, buf)
      }
      const hash = sha256(buf)
      if (hash !== source.sha256) {
        throw new Error(`${form} ${year}: SHA-256 ${hash} differs from the pinned ${source.sha256}; review the new PDF before re-pinning`)
      }
      out.push({ form, year: Number(year), file, source, servedBy })
    }
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out')
  for (const s of await ensureSources(i === -1 ? DEFAULT_CACHE : process.argv[i + 1])) {
    console.log(`[formulare] ${s.form} ${s.year}: ${s.servedBy} -> ${s.file}`)
  }
}
