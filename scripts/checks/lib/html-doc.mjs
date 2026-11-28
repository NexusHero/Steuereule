// Reads a page of docs/ the way the checks read text: as lines with pipe tables and backtick
// citations. The documentation is HTML (ADR-0116); the checks' parsers were written for Markdown
// and stay as they are, so a page is turned back into that shape first:
//
//   <code>apps/api/x.test.ts:12</code>  ->  `apps/api/x.test.ts:12`
//   <tr><td>REQ-002</td><td>…</td></tr> ->  | REQ-002 | … |
//
// The result has one entry per line of the HTML file, so a finding's line number is the line to
// open in the page's source. Only the document itself is read (`<article class="prose">`); the
// navigation and the page head carry no claims.

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' }
const decodeEntities = (text) => text.replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => ENTITIES[entity])

/** One line of HTML as Markdown-like text: code, emphasis and links keep their marks, other tags go. */
export function inlineText(html) {
  let text = ''
  let at = 0
  let href = null
  while (at < html.length) {
    const open = html.indexOf('<', at)
    if (open === -1) break
    const close = html.indexOf('>', open)
    if (close === -1) break
    text += html.slice(at, open)
    const tag = html.slice(open + 1, close)
    const name = tag.split(/[\s/]/).find((part) => part !== '')?.toLowerCase() ?? ''
    const closing = tag.startsWith('/')
    if (name === 'code') text += '`'
    else if (name === 'strong' || name === 'b') text += '**'
    else if (name === 'em' || name === 'i') text += '*'
    else if (name === 'del' || name === 's') text += '~~'
    else if (name === 'a' && !closing) {
      // The anchor mark the page puts in front of a heading is not part of the document's text.
      if (tag.includes('class="anchor"')) {
        const end = html.indexOf('</a>', close)
        at = end === -1 ? close + 1 : end + '</a>'.length
        continue
      }
      const quoted = tag.indexOf('href="')
      href = quoted === -1 ? null : tag.slice(quoted + 6, tag.indexOf('"', quoted + 6))
      text += '['
    } else if (name === 'a' && closing) {
      text += href === null ? ']' : `](${href})`
      href = null
    }
    at = close + 1
  }
  return decodeEntities(text + html.slice(at))
}

/** A table cell: its text, with a literal `|` escaped as Markdown escapes it inside a cell. */
const cellText = (html) => inlineText(html).trim().replace(/\|/g, '\\|')

const CELL_RE = /^<t[hd](?:\s[^>]*)?>(.*)<\/t[hd]>$/

/**
 * @param {string} html a page of docs/
 * @returns {string[]} one Markdown-like line per line of `html`; lines outside the document are empty
 */
export function markdownLinesOfHtml(html) {
  const source = html.split('\n')
  const lines = source.map(() => '')
  let inDocument = false
  let inTable = false
  let headerDone = false
  /** @type {{at: number, cells: string[]} | null} */
  let row = null
  let columns = 0
  for (let i = 0; i < source.length; i += 1) {
    const line = source[i].trim()
    if (!inDocument) {
      if (line.startsWith('<article class="prose"')) inDocument = true
      continue
    }
    if (line.startsWith('</article>')) break
    if (line.includes('<table')) {
      inTable = true
      headerDone = false
      continue
    }
    if (!inTable) {
      lines[i] = inlineText(source[i])
      continue
    }
    // marked closes body and table on one line.
    if (line.includes('</table>')) {
      inTable = false
      continue
    }
    // Inside a table every line carries something: an empty line would end the table for a parser.
    lines[i] = '|'
    // The first row of a body shares its line with `<tbody>`.
    if (line.includes('<tr')) {
      row = { at: i, cells: [] }
    } else if (row !== null && CELL_RE.test(line)) {
      row.cells.push(cellText(CELL_RE.exec(line)[1]))
    } else if (line.startsWith('</tr>') && row !== null) {
      const text = `| ${row.cells.join(' | ')} |`
      columns = row.cells.length
      // The header row stands directly above its separator; a body row stands where it begins.
      lines[headerDone ? row.at : i] = text
      row = null
    } else if (line.startsWith('</thead>')) {
      lines[i] = `|${' --- |'.repeat(columns)}`
      headerDone = true
    }
  }
  return lines
}
