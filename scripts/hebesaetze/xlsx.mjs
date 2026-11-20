// A minimal .xlsx reader (zip central directory + sheet XML), enough for the Destatis tables. The repo
// has no spreadsheet dependency, and one table a year does not justify adding one.
import { inflateRawSync } from 'node:zlib'

function unzip(buf) {
  const files = new Map()
  // The end-of-central-directory record sits in the last 64 KiB; its signature is 0x06054b50.
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i += 1) {
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(dataStart, dataStart + size)
    files.set(name, method === 0 ? raw : inflateRawSync(raw))
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

const decode = (s) =>
  s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll('&amp;', '&')

const columnIndex = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

/** Every sheet of the workbook as `{ name, rows }`, rows as arrays of cell strings. */
export function readWorkbook(buf) {
  const files = unzip(buf)
  const text = (name) => files.get(name)?.toString('utf8') ?? ''
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
  const sheets = []
  for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.get(m[2]).replace(/^\/?(xl\/)?/, 'xl/')
    const rows = []
    for (const row of text(target).matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = []
      for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = /t="([^"]+)"/.exec(c[2])?.[1]
        const inner = c[3] ?? ''
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        let value = ''
        if (type === 's') value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') value = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
        else if (v !== undefined) value = decode(v)
        cells[columnIndex(c[1])] = value
      }
      rows.push(Array.from(cells, (x) => x ?? ''))
    }
    sheets.push({ name: decode(m[1]).trim(), rows })
  }
  return sheets
}
