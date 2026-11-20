// Reads the numbered lines (Zeilen) of an official tax form from its PDF text layer, with the word
// coordinates poppler's `pdftotext -bbox` gives (poppler is already required by the Vordrucke
// process, docs/process/vordrucke-jahreswechsel.md).
//
// Why coordinates and not the plain layout text: the forms place the Zeile number differently per
// year (vertically centred on a two-line label in 2022, on its last line from 2024), and a label line
// of one Zeile can sit between the number and the label of the next. What is stable is the spacing:
// the lines of one label follow each other at the line height, while two Zeilen are further apart.
// So label lines are grouped into blocks by that gap, and each block goes to the Zeile number that
// lies inside it. A block without a number is a section heading.
import { execFileSync } from 'node:child_process'

/** The form key printed in each page footer tells the form's own pages from the letter around it. */
export const PAGE_KEYS = {
  euer: /\b20\d\dAnlEÜR80\d\b/,
  ust: /\b20\d\dUSt2A50\d\b/,
  'est-1-a': /\b20\d\dESt1A01\dNET\b/,
  'anlage-sonstiges': /\b20\d\dAnlSonstiges41\dNET\b/,
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

const decode = (s) =>
  s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')

/** Words per page: `{ x, y0, y1, x1, text }` in PDF points, y growing downwards. */
function readPages(file) {
  const html = run('pdftotext', ['-bbox', file, '-'])
  const pages = []
  for (const page of html.split('<page ').slice(1)) {
    const words = []
    for (const m of page.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      words.push({ x: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), text: decode(m[5]) })
    }
    pages.push(words)
  }
  return pages
}

const BARCODE = /^\d{12}$/
const ZEILE = /^\d{1,3}[a-z]?$/
const KZ = /^\d{3}$/

// The 2022 Umsatzsteuer form runs dot leaders from the label to the box; they are layout, not text.
const tidy = (label) => label.replace(/(?:\s*\.){3,}/g, '').replace(/\s+([).,;])/g, '$1').trim()
const mid = (w) => (w.y0 + w.y1) / 2

/** Words with the same baseline form a physical line; split further where the horizontal gap is wide. */
function physicalLines(words) {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x - b.x)
  const lines = []
  for (const w of sorted) {
    const line = lines.find((l) => Math.abs(l.y0 - w.y0) < 1.5)
    if (line) line.words.push(w)
    else lines.push({ y0: w.y0, y1: w.y1, words: [w] })
  }
  const segments = []
  for (const line of lines) {
    line.words.sort((a, b) => a.x - b.x)
    let current = null
    for (const w of line.words) {
      if (current && w.x - current.x1 < 9) {
        current.words.push(w)
        current.x1 = w.x1
      } else {
        current = { x: w.x, x1: w.x1, y0: line.y0, y1: line.y1, words: [w] }
        segments.push(current)
      }
    }
  }
  for (const s of segments) s.text = s.words.map((w) => w.text).join(' ')
  return segments
}

function joinLabel(parts) {
  let label = ''
  for (const part of parts) {
    // A word broken at the line end ("Anla-" / "ge") is joined; "Sach-, Nutzungs- und" keeps its hyphens.
    if (/[a-zäöüß]-$/.test(label) && /^[a-zäöüß]/.test(part) && !/^(und|oder|bzw\.|sowie)\b/.test(part)) {
      label = label.slice(0, -1) + part
    } else {
      label = label ? `${label} ${part}` : part
    }
  }
  // Some years set the line-end hyphen as a word of its own ("Beträ -" / "ge").
  return label.replace(/\s+/g, ' ').replace(/([a-zäöüß]) - ([a-zäöüß])/g, '$1$2').trim()
}

/**
 * Parses one page into rows `{ zeile, kz, label, headings, others }`: `headings` are the unnumbered
 * blocks between the previous row and this one (section titles), `others` the text printed in further
 * columns of the row (the right-hand checkboxes of the Hauptvordruck, for example).
 */
export function parsePage(words) {
  const usable = words.filter((w) => !BARCODE.test(w.text))
  // Zeile numbers stand alone at the left margin, in one column per page.
  const leftmost = Math.min(...usable.filter((w) => ZEILE.test(w.text)).map((w) => w.x))
  const numbers = usable.filter((w) => ZEILE.test(w.text) && w.x - leftmost < 6)
  const numberSet = new Set(numbers)
  const segs = physicalLines(usable.filter((w) => !numberSet.has(w)))
  const numberRight = Math.max(...numbers.map((n) => n.x1))
  // A label starts right of the number column; whatever starts further right is a box, a Kennzahl
  // or a note in another column.
  const labelStart = Math.min(...segs.filter((s) => s.x > numberRight).map((s) => s.x))
  const labelSegs = segs.filter((s) => s.x - labelStart < 30 && !KZ.test(s.text)).sort((a, b) => a.y0 - b.y0)

  const blocks = []
  for (const s of labelSegs) {
    const last = blocks.at(-1)
    if (last && s.y0 - last.lastY0 < 10.5) {
      last.segs.push(s)
      last.lastY0 = s.y0
      last.y1 = Math.max(last.y1, s.y1)
    } else {
      blocks.push({ y0: s.y0, y1: s.y1, lastY0: s.y0, segs: [s] })
    }
  }

  const rows = []
  for (const n of numbers) {
    const c = mid(n)
    const block = blocks.find((b) => c >= b.y0 - 2 && c <= b.y1 + 2)
    let own = block ? block.segs : []
    if (block) {
      block.used = true
      // Two Zeilen whose labels run into each other share a block; each line then goes to the
      // nearer number.
      const sharing = numbers.filter((o) => mid(o) >= block.y0 - 2 && mid(o) <= block.y1 + 2)
      if (sharing.length > 1) {
        const nearest = (seg) => sharing.reduce((a, b) => (Math.abs(mid(b) - mid(seg)) < Math.abs(mid(a) - mid(seg)) ? b : a))
        own = own.filter((seg) => nearest(seg) === n)
      }
    }
    const top = Math.min(n.y0, ...own.map((x) => x.y0))
    const bottom = Math.max(n.y1, ...own.map((x) => x.y1))
    rows.push({ zeile: n.text, y: c, top, bottom, own, label: joinLabel(own.map((x) => x.text)), kz: [] })
  }
  rows.sort((a, b) => a.y - b.y)
  // In a shared block, a line ending in "," or a hyphen that was given to the upper number continues
  // into the lower one when that one's label starts mid-sentence.
  for (let i = 1; i < rows.length; i += 1) {
    const upper = rows[i - 1]
    const lower = rows[i]
    if (upper.own.length > 1 && /^[a-zäöü]/.test(lower.own[0]?.text ?? '') && /[,-]$/.test(upper.own.at(-1).text)) {
      lower.own.unshift(upper.own.pop())
      upper.label = joinLabel(upper.own.map((x) => x.text))
      lower.label = joinLabel(lower.own.map((x) => x.text))
    }
  }
  for (const r of rows) {
    r.headings = []
    r.others = []
  }
  for (const b of blocks.filter((x) => !x.used)) {
    const next = rows.find((r) => r.top >= b.y1)
    if (next) next.headings.push(joinLabel(b.segs.map((s) => s.text)))
  }
  for (const s of segs.filter((x) => x.x - labelStart >= 30 && !KZ.test(x.text))) {
    const row = rows.find((r) => mid(s) >= r.top - 1 && mid(s) <= r.bottom + 1)
    if (row) row.others.push(s.text)
  }
  // A Kennzahl belongs to the row whose vertical extent is nearest to the Kennzahl's middle.
  for (const w of usable.filter((x) => KZ.test(x.text) && !numberSet.has(x))) {
    const inLabel = labelSegs.some((s) => s.words.includes(w))
    if (inLabel) continue
    const c = mid(w)
    let best = null
    let bestD = Infinity
    for (const r of rows) {
      const d = c < r.top ? r.top - c : c > r.bottom ? c - r.bottom : 0
      if (d < bestD) {
        best = r
        bestD = d
      }
    }
    if (best && bestD < 8) best.kz.push(w)
  }
  return rows.map(({ zeile, label, kz, headings, others }) => {
    // A Kennzahl set only one space after the label text ("abzusehen. 802") reads as part of it.
    // Left to right, so that "nicht abziehbar" comes before "abziehbar" and Bildung before Auflösung.
    kz = kz.sort((p, q) => p.x - q.x).map((w) => w.text)
    const glued = /^(.*\S) (\d{3})$/.exec(label)
    if (glued && !/(Zeile|Zeilen|Nr\.|Abs\.|§|und|bis)$/.test(glued[1])) {
      label = glued[1]
      kz = [glued[2], ...kz]
    }
    return { zeile, label: tidy(label), kz: [...new Set(kz)], headings, others }
  })
}

/** Every numbered line of the form inside `file`; pages are told by the footer key of `form`. */
export function extractForm(file, form) {
  const key = PAGE_KEYS[form]
  const rows = []
  readPages(file).forEach((words, index) => {
    if (!words.some((w) => key.test(w.text))) return
    for (const row of parsePage(words)) {
      // A Zeile printed again at the top of the next page as "Übertrag" is the same line.
      if (!rows.some((r) => r.zeile === row.zeile)) rows.push({ ...row, page: index + 1 })
    }
  })
  return rows
}
