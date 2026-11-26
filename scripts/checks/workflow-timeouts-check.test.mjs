// node --test scripts/checks/workflow-timeouts-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findViolations, jobsWithoutTimeout } from './workflow-timeouts-check.mjs'

const wf = (jobs) => `name: x\non: push\njobs:\n${jobs}\nenv:\n  A: b\n`

test('a job without timeout-minutes is reported, one with it is not', () => {
  const src = wf(`  a:\n    runs-on: x\n    timeout-minutes: 5\n  b:\n    runs-on: x\n    steps: []\n`)
  assert.deepEqual(jobsWithoutTimeout(src), ['b'])
})

test('a timeout-minutes at step level does not count for the job', () => {
  const src = wf(`  a:\n    runs-on: x\n    steps:\n      - run: y\n        timeout-minutes: 5\n`)
  assert.deepEqual(jobsWithoutTimeout(src), ['a'])
})

test('an expression value counts, a bare key does not', () => {
  assert.deepEqual(jobsWithoutTimeout(wf(`  a:\n    timeout-minutes: \${{ fromJSON(vars.T) }}\n`)), [])
  assert.deepEqual(jobsWithoutTimeout(wf(`  a:\n    timeout-minutes:\n`)), ['a'])
})

test('a reusable-workflow call is exempt', () => {
  assert.deepEqual(jobsWithoutTimeout(wf(`  a:\n    uses: ./.github/workflows/x.yml\n`)), [])
})

test('a file without jobs yields nothing', () => {
  assert.deepEqual(jobsWithoutTimeout('name: x\n'), [])
})

test('the repository workflows all set timeout-minutes', () => {
  assert.deepEqual(findViolations(new URL('../../.github/workflows/', import.meta.url).pathname), [])
})
