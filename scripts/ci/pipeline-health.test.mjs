// node --test scripts/ci/pipeline-health.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flakyJobs, mainHealth, percentile, reportMarkdown, timeToGreen, workflowDurations } from './pipeline-health.mjs'

const run = (over) => ({
  id: 1,
  name: 'Quality',
  event: 'pull_request',
  head_branch: 'feat/x',
  head_sha: 'a',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  run_started_at: '2026-11-26T10:00:00Z',
  updated_at: '2026-11-26T10:10:00Z',
  ...over,
})

test('percentile takes the nearest rank and is undefined for nothing', () => {
  assert.equal(percentile([], 50), undefined)
  assert.equal(percentile([5], 95), 5)
  assert.equal(percentile([1, 2, 3, 4], 50), 2)
  assert.equal(percentile([4, 1, 3, 2], 95), 4)
})

test('workflow durations count green pull-request runs only', () => {
  const rows = workflowDurations([
    run({ id: 1 }),
    run({ id: 2, updated_at: '2026-11-26T10:20:00Z' }),
    run({ id: 3, conclusion: 'failure', updated_at: '2026-11-26T11:00:00Z' }),
    run({ id: 4, conclusion: 'cancelled' }),
    run({ id: 5, event: 'push', head_branch: 'main', updated_at: '2026-11-26T12:00:00Z' }),
  ])
  assert.deepEqual(rows, [{ workflow: 'Quality', runs: 2, p50: 600, p95: 1200 }])
})

test('time to green spans every workflow of a commit, and skips a commit that is not green everywhere', () => {
  const result = timeToGreen([
    run({ name: 'Quality', head_sha: 'a', updated_at: '2026-11-26T10:10:00Z' }),
    run({ name: 'Build & E2E', head_sha: 'a', run_started_at: '2026-11-26T10:00:05Z', updated_at: '2026-11-26T10:30:00Z' }),
    run({ name: 'Quality', head_sha: 'b' }),
    run({ name: 'Build & E2E', head_sha: 'b', conclusion: 'failure' }),
    run({ name: 'Quality', head_sha: 'c' }),
    run({ name: 'Build & E2E', head_sha: 'c', conclusion: 'cancelled' }),
  ])
  assert.deepEqual(result, { commits: 1, p50: 1800, p95: 1800 })
})

test('main health counts failed pushes to main per workflow, cancelled runs left out', () => {
  const main = { event: 'push', head_branch: 'main' }
  const rows = mainHealth([
    run({ ...main, id: 1 }),
    run({ ...main, id: 2, conclusion: 'failure' }),
    run({ ...main, id: 3, conclusion: 'cancelled' }),
    run({ id: 4, conclusion: 'failure' }),
  ])
  assert.deepEqual(rows, [{ workflow: 'Quality', runs: 2, failed: 1 }])
})

test('a job is flaky when it failed and a later attempt of the same run passed', () => {
  const rows = flakyJobs([
    {
      workflow: 'Build & E2E',
      attempts: [
        [{ name: 'gate a', conclusion: 'failure' }, { name: 'gate b', conclusion: 'success' }],
        [{ name: 'gate a', conclusion: 'success' }, { name: 'gate b', conclusion: 'success' }],
      ],
    },
    // Failed again on the rerun: broken, not flaky.
    { workflow: 'Quality', attempts: [[{ name: 'unit', conclusion: 'failure' }], [{ name: 'unit', conclusion: 'failure' }]] },
    // Cancelled first, green later: nothing failed.
    { workflow: 'Quality', attempts: [[{ name: 'lint', conclusion: 'cancelled' }], [{ name: 'lint', conclusion: 'success' }]] },
  ])
  assert.deepEqual(rows, [{ workflow: 'Build & E2E', job: 'gate a', times: 1 }])
})

test('the report states the window, the numbers and what the flake count cannot see', () => {
  const markdown = reportMarkdown({
    days: 28,
    until: '2026-11-26',
    durations: [{ workflow: 'Quality', runs: 2, p50: 600, p95: 1200 }],
    green: { commits: 1, p50: 1800, p95: 1800 },
    main: [{ workflow: 'Quality', runs: 2, failed: 1 }],
    flaky: [],
    rerunRuns: 0,
    totalRuns: 7,
  })
  assert.match(markdown, /^## Pipeline health — 28 days to 2026-11-26$/m)
  assert.match(markdown, /^\| Quality \| 2 \| 10 min \| 20 min \|$/m)
  assert.match(markdown, /1 commit\(s\).*median 30 min.*95th percentile 30 min/)
  assert.match(markdown, /^\| Quality \| 2 \| 1 \| 50 % \|$/m)
  assert.match(markdown, /No job failed and then passed on a rerun \(0 of 7 runs were rerun\)/)
  assert.match(markdown, /a failure that a new push fixed is not counted/)
})
