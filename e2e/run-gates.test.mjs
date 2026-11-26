// The gate list is what keeps an E2E test from silently dropping out of CI: these checks fail on a gate
// without a group, a group without a gate, a script that does not exist, or a matrix that misses a group.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// Reverse direction (#203): a script in e2e/package.json that no CI job runs looks like a gate and is not one
// (that is how breakpoint-layout.mjs sat unrun). Every script must be run by a gate, by a workflow step, or by the
// master scenario runner, or be listed here with the reason it is deliberately not in CI.
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const NOT_IN_CI = {
  // An empty list is the goal. Each entry needs a reason and is dropped by the test below once CI runs the script.
  'google-auth': 'REQ-008 Google sign-in gate (#203, class b): needs the API booted with the dev-only Google credentials; not yet proven safe to run in a gate group, tracked as a gap in docs/process/script-inventory.md',
}

function e2eScripts() {
  const scripts = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).scripts
  return Object.entries(scripts).map(([name, command]) => ({ name, path: /^node (\S+\.mjs)/.exec(command)?.[1] }))
}

function ciCoverage() {
  const workflows = join(ROOT, '.github', 'workflows')
  const text = [
    JSON.stringify(loadGates().gates.flatMap((g) => g.commands)),
    ...readdirSync(workflows).map((f) => readFileSync(join(workflows, f), 'utf8')),
  ].join('\n')
  const runner = readFileSync(join(HERE, 'scenarios', 'run-all-scenarios.mjs'), 'utf8')
  return (path) => text.includes(`e2e/${path}`) || (path.startsWith('scenarios/') && runner.includes(`'./${path.slice('scenarios/'.length)}'`))
}

test('every e2e package.json script is run by CI or deliberately exempt', () => {
  const covered = ciCoverage()
  const orphans = e2eScripts().filter((s) => !s.path || (!covered(s.path) && !(s.name in NOT_IN_CI))).map((s) => s.name)
  assert.deepEqual(orphans, [], 'these e2e scripts are in no gate, no workflow step and not in NOT_IN_CI')
})

test('the exemption list names only real scripts that CI really does not run', () => {
  const covered = ciCoverage()
  const scripts = new Map(e2eScripts().map((s) => [s.name, s]))
  for (const name of Object.keys(NOT_IN_CI)) {
    assert.ok(scripts.has(name), `NOT_IN_CI lists "${name}", which is not an e2e script`)
    assert.equal(covered(scripts.get(name).path), false, `"${name}" is now run by CI: drop it from NOT_IN_CI`)
  }
})
