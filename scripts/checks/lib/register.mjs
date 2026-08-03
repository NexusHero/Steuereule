// Parses docs/requirements/register.md's two pipe tables (the summary table and the
// Traceability matrix) into structured rows, and extracts file-path citations from a cell.
//
// Deliberately hand-rolled rather than a Markdown-table library: the format here is one
// row per line (no multi-line cells), which a ~40-line parser handles completely, and a
// dependency buys nothing extra for that shape.

const KNOWN_EXTENSIONS = 'ts|tsx|mjs|md|puml|svg'

// Backtick-fenced path-like citation, with brace-expansion support
// (`apps/api/test/cockpit.{http,service,integration}.test.ts`) and an optional trailing
// `:123` / `:123-456` line locator.
const CITATION_RE = new RegExp('`([\\w{},./-]+\\.(?:' + KNOWN_EXTENSIONS + '))(:[\\d,-]+)?`', 'g')

/**
 * Bash-style single-level brace expansion: `a.{b,c}.d` -> ['a.b.d', 'a.c.d'].
 * @param {string} str
 * @returns {string[]}
 */
export function expandBraces(str) {
  const m = str.match(/\{([^{}]+)\}/)
  if (!m) return [str]
  const [full, inner] = m
  const options = inner.split(',')
  return options.flatMap((opt) => expandBraces(str.slice(0, m.index) + opt + str.slice(m.index + full.length)))
}

/**
 * @param {string} cellText
 * @returns {{raw: string, lineRange: string|undefined, paths: string[]}[]}
 */
export function extractCitations(cellText) {
  const out = []
  for (const match of cellText.matchAll(CITATION_RE)) {
    const [, rawPath, lineRange] = match
    out.push({ raw: rawPath, lineRange: lineRange?.slice(1), paths: expandBraces(rawPath) })
  }
  return out
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/**
 * @param {string} text full register.md content
 * @returns {{name: string, headers: string[], rows: {lineNumber: number, cells: string[]}[]}[]}
 */
export function parseTables(text) {
  const lines = text.split('\n')
  const tables = []
  let current = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\|\s*REQ\s*\|/.test(line)) {
      const sep = lines[i + 1] || ''
      if (!/^\|[\s:-]+\|/.test(sep)) continue
      const headers = splitRow(line)
      current = {
        name: headers.includes('Statement') ? 'summary' : 'traceability',
        headers,
        rows: [],
      }
      tables.push(current)
      i += 1
      continue
    }
    if (current && /^\|\s*REQ-\d{3}\b/.test(line)) {
      current.rows.push({ lineNumber: i + 1, cells: splitRow(line) })
    } else if (current && line.trim() === '') {
      current = null
    }
  }
  return tables
}

/**
 * The column each table uses for test citations, by convention (see register.md's own
 * headers): the summary table's "Acceptance test", the traceability table's "Location".
 */
export function citationColumnIndex(table) {
  const name = table.name === 'summary' ? 'Acceptance test' : 'Location'
  return table.headers.indexOf(name)
}

export function statusColumnIndex(table) {
  const name = table.name === 'summary' ? 'Status' : 'State'
  return table.headers.indexOf(name)
}

export function reqColumnIndex(table) {
  return table.headers.indexOf('REQ')
}
