// node --test scripts/release/guard.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CI_WORKFLOW_NAME, decide, hasSuccessfulPushRun, isReleaseRef } from './guard.mjs'

const SHA = 'a'.repeat(40)
const run = (over = {}) => ({ name: CI_WORKFLOW_NAME, event: 'push', conclusion: 'success', status: 'completed', head_sha: SHA, ...over })
const good = { ref: 'refs/tags/v1.2.3', sha: SHA, onMain: true, runs: [run()] }

test('a release ref is a tag vMAJOR.MINOR.PATCH with an optional pre-release part', () => {
  for (const ref of ['refs/tags/v0.1.0', 'refs/tags/v1.2.3', 'refs/tags/v10.20.30', 'refs/tags/v1.0.0-rc.1', 'refs/tags/v1.0.0-beta']) {
    assert.equal(isReleaseRef(ref), true, ref)
  }
})

test('anything else is not a release ref: branches, tags without the v, partial versions, leading zeros, trailing text', () => {
  for (const ref of [
    'refs/heads/main',
    'refs/heads/v1.2.3',
    'refs/tags/1.2.3',
    'refs/tags/v1.2',
    'refs/tags/v1.2.3.4',
    'refs/tags/v01.2.3',
    'refs/tags/v1.2.3-',
    'refs/tags/v1.2.3+build',
    'refs/tags/v1.2.3 ',
    'refs/tags/v1.2.3\nrefs/tags/v9.9.9',
    'refs/tags/release-v1.2.3',
    'refs/pull/7/merge',
    '',
    undefined,
  ]) {
    assert.equal(isReleaseRef(ref), false, JSON.stringify(ref))
  }
})

test('a run counts only when it is the CI workflow, a push, successful, and for exactly this commit', () => {
  assert.equal(hasSuccessfulPushRun([run()], SHA), true)
  assert.equal(hasSuccessfulPushRun([run({ name: 'Quality' })], SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ event: 'pull_request' })], SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ event: 'workflow_dispatch' })], SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ conclusion: 'failure' })], SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ conclusion: null, status: 'in_progress' })], SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ head_sha: 'b'.repeat(40) })], SHA), false)
  assert.equal(hasSuccessfulPushRun([], SHA), false)
  assert.equal(hasSuccessfulPushRun(undefined, SHA), false)
  assert.equal(hasSuccessfulPushRun([run({ conclusion: 'failure' }), run()], SHA), true)
})

test('a tag on main with a green CI run passes', () => {
  assert.deepEqual(decide(good), { ok: true, errors: [] })
})

test('a branch ref is refused, with the way out', () => {
  const result = decide({ ...good, ref: 'refs/heads/main' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /refs\/heads\/main/)
  assert.match(result.errors.join('\n'), /tag/i)
})

test('a tagged commit that is not on main is refused', () => {
  const result = decide({ ...good, onMain: false })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /main/)
})

test('a commit without a green Build & E2E push run is refused', () => {
  const result = decide({ ...good, runs: [run({ conclusion: 'failure' })] })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /Build & E2E/)
})

test('every refusal is reported, not only the first', () => {
  const result = decide({ ref: 'refs/heads/x', sha: SHA, onMain: false, runs: [] })
  assert.equal(result.errors.length, 3)
})

test('an unreadable fact is a refusal, never a pass', () => {
  assert.equal(decide({ ...good, onMain: undefined }).ok, false)
  assert.equal(decide({ ...good, runs: undefined }).ok, false)
  assert.equal(decide({ ...good, sha: '' }).ok, false)
})
