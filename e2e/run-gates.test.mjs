// The gate list is what keeps an E2E test from silently dropping out of CI: these checks fail on a gate
// without a group, a group without a gate, a script that does not exist, or a matrix that misses a group.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadGates, matrix, validate } from './run-gates.mjs'

test('the shipped gate list is sound', () => {
  assert.deepEqual(validate(loadGates()), [])
})

test('every group with gates is in the CI matrix, and no other', () => {
  const config = loadGates()
  const inMatrix = matrix(config).include.map((e) => e.group).sort()
  const withGates = [...new Set(config.gates.map((g) => g.group))].sort()
  assert.deepEqual(inMatrix, withGates)
})

test('a gate without a known group, a duplicate id, an unknown script and an empty group are all reported', () => {
  const config = {
    groups: { a: { title: 'a', stack: true, fakeKi: false }, empty: { title: 'e', stack: true, fakeKi: false } },
    gates: [
      { id: 'one', group: 'a', name: 'one', commands: ['node e2e/run-gates.mjs'] },
      { id: 'one', group: 'nope', name: 'dup', commands: ['node e2e/does-not-exist.mjs'] },
    ],
  }
  const problems = validate(config).join('\n')
  assert.match(problems, /duplicate gate id "one"/)
  assert.match(problems, /unknown group "nope"/)
  assert.match(problems, /e2e\/does-not-exist\.mjs, which does not exist/)
  assert.match(problems, /group "empty" has no gate/)
})

test('the gates are the ones the pipeline ran before the split (46 that ran before the split, plus the gate-list check)', () => {
  // Frozen at the split of the browser-gates job (ADR-0112). Adding a gate raises it on purpose; a drop fails here.
  assert.equal(loadGates().gates.length, 47)
})
