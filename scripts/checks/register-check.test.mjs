// node --test scripts/checks/register-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countLines, lineRangeFindings, lineRangeProblems } from './register-check.mjs'

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
    { check: '1c-line-range-bounds', message: "register.md:3 cites `apps/api/test/a.test.ts:112-175` — `112-175` reaches past the file's last line (156)." },
    { check: '1c-line-range-bounds', message: "register.md:4 cites `apps/api/test/b.test.ts:30-21` — `30-21` starts after it ends." },
    { check: '1c-line-range-bounds', message: "register.md:4 cites `apps/api/test/b.test.ts:30-21` — `30-21` reaches past the file's last line (20)." },
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
    ["register.md:1 cites `apps/api/test/b.test.ts:100-120` — `100-120` reaches past the file's last line (20)."],
  )
})
