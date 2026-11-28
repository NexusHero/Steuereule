// node --test scripts/checks/register-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countLines, lineRangeFindings, lineRangeProblems } from './register-check.mjs'
import { inlineText, markdownLinesOfHtml } from './lib/html-doc.mjs'
import { extractCitations, parseTables } from './lib/register.mjs'

// A cited file is stood in for by its line count; a path missing here does not resolve.
const fixtureFiles = new Map([
  ['apps/api/test/a.test.ts', countLines('line\n'.repeat(156))],
  ['apps/api/test/b.test.ts', countLines('line\n'.repeat(20))],
])
const lineCountOf = (p) => fixtureFiles.get(p) ?? null
const row = (cell) => `| REQ-001 | statement | ${cell} | green |`

test('counts lines as an editor shows them', () => {
  assert.equal(countLines(''), 0)
  assert.equal(countLines('a'), 1)
  assert.equal(countLines('a\n'), 1)
  assert.equal(countLines('a\nb'), 2)
  assert.equal(countLines('line\n'.repeat(156)), 156)
})

test('a range inside the file passes, up to and including its last line', () => {
  assert.deepEqual(lineRangeProblems('92-155', 156), [])
  assert.deepEqual(lineRangeProblems('1-156', 156), [])
  assert.deepEqual(lineRangeProblems('59', 156), [])
  assert.deepEqual(lineRangeProblems('10,20-30', 156), [])
})

test('a range reaching past the last line fails', () => {
  assert.equal(lineRangeProblems('112-175', 156).length, 1)
  assert.equal(lineRangeProblems('157', 156).length, 1)
  assert.equal(lineRangeProblems('10,150-160', 156).length, 1)
})

test('a range that starts after it ends fails, even inside the file', () => {
  assert.equal(lineRangeProblems('40-30', 156).length, 1)
})

test('line 0 and malformed segments fail', () => {
  assert.equal(lineRangeProblems('0', 156).length, 1)
  for (const bad of ['-5', '5-', '1--2', '1,', ',3']) {
    assert.ok(lineRangeProblems(bad, 156).length > 0, bad)
  }
})

test('the register scan names the row, the citation and the bad range', () => {
  const registerLines = [
    '# Register',
    row('`apps/api/test/a.test.ts:92-155`'),
    row('`apps/api/test/a.test.ts:112-175` and `apps/api/test/b.test.ts:5-10`'),
    row('`apps/api/test/b.test.ts:30-21`'),
  ]
  assert.deepEqual(lineRangeFindings(registerLines, lineCountOf), [
    { check: '1c-line-range-bounds', message: "register.html:3 cites `apps/api/test/a.test.ts:112-175` — `112-175` reaches past the file's last line (156)." },
    { check: '1c-line-range-bounds', message: "register.html:4 cites `apps/api/test/b.test.ts:30-21` — `30-21` starts after it ends." },
    { check: '1c-line-range-bounds', message: "register.html:4 cites `apps/api/test/b.test.ts:30-21` — `30-21` reaches past the file's last line (20)." },
  ])
})

test('a citation without a locator, or of a file that does not resolve, is left to check 1', () => {
  const registerLines = [row('`apps/api/test/a.test.ts`'), row('`apps/api/test/missing.test.ts:1-9999`')]
  assert.deepEqual(lineRangeFindings(registerLines, lineCountOf), [])
})

test('a brace-expanded citation checks the range against every expanded file', () => {
  const findings = lineRangeFindings([row('`apps/api/test/{a,b}.test.ts:100-120`')], lineCountOf)
  assert.deepEqual(
    findings.map((f) => f.message),
    ["register.html:1 cites `apps/api/test/b.test.ts:100-120` — `100-120` reaches past the file's last line (20)."],
  )
})

// --- lib/html-doc.mjs: the register is a page of docs/ (ADR-0116) and is read back into the shape
// the parsers above were written for.

const page = (body) => ['<header>', '<p><code>outside/the/document.ts</code></p>', '</header>', '      <article class="prose">', ...body, '      </article>', '<p><code>after/the/document.ts</code></p>'].join('\n')

test('a line of a page keeps its code, emphasis and links as Markdown marks', () => {
  assert.equal(
    inlineText('<p>See <code>apps/api/test/a.test.ts:12-30</code>, <strong>not met</strong>, <a href="../adr/0012-x.html">ADR-0012</a> &amp; <em>more</em>.</p>'),
    'See `apps/api/test/a.test.ts:12-30`, **not met**, [ADR-0012](../adr/0012-x.html) & *more*.',
  )
})

test('the anchor mark in front of a heading is not part of its text', () => {
  assert.equal(inlineText('<h2 id="notes"><a class="anchor" href="#notes" aria-hidden="true" tabindex="-1">#</a>Notes</h2>'), 'Notes')
})

test('a table becomes pipe rows: the header directly above its separator, a body row on the line it begins', () => {
  const lines = markdownLinesOfHtml(
    page(['<div class="table"><table>', '<thead>', '<tr>', '<th>REQ</th>', '<th>Statement</th>', '<th>Acceptance test</th>', '<th>Status</th>', '</tr>', '</thead>', '<tbody><tr id="REQ-001">', '<td>REQ-001</td>', '<td>A <code>a|b</code> key</td>', '<td><code>apps/api/test/a.test.ts</code></td>', '<td>Done</td>', '</tr>', '<tr>', '<td>REQ-002</td>', '<td>Second</td>', '<td></td>', '<td>Open</td>', '</tr>', '</tbody></table></div>', '<p>after the table</p>']),
  )
  // 4 lines of head before the article's first line, so the table opens at index 4.
  assert.equal(lines[11], '| REQ | Statement | Acceptance test | Status |')
  assert.equal(lines[12], '| --- | --- | --- | --- |')
  assert.equal(lines[13], '| REQ-001 | A `a\\|b` key | `apps/api/test/a.test.ts` | Done |')
  assert.equal(lines[19], '| REQ-002 | Second |  | Open |')
  // No line inside the table is empty: an empty line ends a table for the parser.
  assert.ok(lines.slice(5, 25).every((line) => line !== ''))
  assert.equal(lines[26], 'after the table')

  const [table] = parseTables(lines.join('\n'))
  assert.equal(table.name, 'summary')
  assert.deepEqual(
    table.rows.map((parsed) => [parsed.lineNumber, parsed.cells[0], parsed.cells[1]]),
    [
      [14, 'REQ-001', 'A `a\\|b` key'],
      [20, 'REQ-002', 'Second'],
    ],
  )
})

test('only the document is read: the page head, the navigation and what follows the article carry no claims', () => {
  const lines = markdownLinesOfHtml(page(['<p><code>apps/api/test/a.test.ts</code></p>']))
  assert.deepEqual(
    lines.flatMap((line) => extractCitations(line).map((citation) => citation.raw)),
    ['apps/api/test/a.test.ts'],
  )
  assert.equal(lines.length, 7)
})
