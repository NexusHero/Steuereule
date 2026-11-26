// node --test e2e/scenarios/scenario-groups.test.mjs
// The CI job of each scenario group is named after what it covers, so a scenario has to be put in a group on
// purpose: these tests fail when one is in none or two, when a group names a scenario that does not exist, or when
// the CI matrix and the groups disagree.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { groupProblems, SCENARIO_GROUPS, unitsOfGroup } from './scenario-groups.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

/** The scenario units run-all-scenarios.mjs runs: one per numbered file, 02 and 03 as one coupled unit; 09b has its own job. */
function unitIdsOnDisk() {
  const numbers = readdirSync(HERE)
    .map((name) => /^(\d{2})-.*\.mjs$/.exec(name)?.[1])
    .filter((number) => number !== undefined)
  return [...new Set(numbers)].filter((number) => number !== '02' && number !== '03').concat('02+03').sort()
}

test('every scenario unit on disk is in exactly one group, and every grouped unit exists', () => {
  assert.deepEqual(groupProblems(unitIdsOnDisk()), [])
})

test('groupProblems names a unit in no group, in two groups, and a group entry with no unit', () => {
  const groups = { a: { title: 'a', units: ['01', '02'] }, b: { title: 'b', units: ['02', '99'] } }
  assert.deepEqual(groupProblems(['01', '02', '03'], groups), [
    'scenario 02 is in more than one group (a, b)',
    'scenario 03 is in no group',
    'group b names scenario 99, which does not exist',
  ])
})

test('unitsOfGroup refuses an unknown group by name', () => {
  assert.deepEqual(unitsOfGroup('cross-border-ch'), SCENARIO_GROUPS['cross-border-ch'].units)
  assert.throws(() => unitsOfGroup('shard-1'), /unknown scenario group 'shard-1'/)
})

test('the CI matrix runs exactly the groups, each under its title', () => {
  const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8')
  const job = ci.slice(ci.indexOf('\n  e2e-scenarios:'), ci.indexOf('\n  e2e-self-employed:'))
  const entries = [...job.matchAll(/- group: (\S+)\n\s+title: '([^']+)'/g)].map((match) => [match[1], match[2]])
  assert.deepEqual(
    entries,
    Object.entries(SCENARIO_GROUPS).map(([key, group]) => [key, group.title]),
  )
  assert.match(job, /name: 'e2e: scenarios — \$\{\{ matrix\.title \}\}'/)
  assert.match(job, /run-all-scenarios\.mjs --group "\$\{\{ matrix\.group \}\}"/)
})
