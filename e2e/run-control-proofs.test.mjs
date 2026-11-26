// node --test e2e/run-control-proofs.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyMutation, loadProofs, proofMatrixEntries, validateProofs, verdict } from './run-control-proofs.mjs'

const proof = (over = {}) => ({
  id: 'fresh-age-default',
  title: 'freshAge back to the default',
  mutation: { file: 'apps/api/src/auth/better-auth.ts', find: '      freshAge: 0,\n', replace: '' },
  command: 'node e2e/device/device-authorization.mjs',
  expect: 'older than a day (403)',
  why: 'ADR-0027',
  ...over,
})

test('the proofs in the repository are sound: each mutation matches its file exactly once', () => {
  assert.deepEqual(validateProofs(loadProofs()), [])
})

test('validation names a mutation that no longer matches, one outside the API sources, and a missing gate script', () => {
  const read = (file) => (file === 'apps/api/src/a.ts' ? 'x = 1\nx = 1\n' : 'y = 2\n')
  const exists = (file) => file !== 'e2e/gone.mjs'
  const problems = validateProofs(
    {
      proofs: [
        proof({ id: 'twice', mutation: { file: 'apps/api/src/a.ts', find: 'x = 1\n', replace: '' } }),
        proof({ id: 'never', mutation: { file: 'apps/api/src/b.ts', find: 'x = 1\n', replace: '' } }),
        proof({ id: 'web', mutation: { file: 'apps/mobile-web/src/c.ts', find: 'y = 2\n', replace: '' } }),
        proof({ id: 'gone', mutation: { file: 'apps/api/src/b.ts', find: 'y = 2\n', replace: '' }, command: 'node e2e/gone.mjs' }),
        proof({ id: 'gone', mutation: { file: 'apps/api/src/b.ts', find: 'y = 2\n', replace: 'y = 2\n' }, expect: '' }),
      ],
    },
    { read, exists },
  )
  assert.deepEqual(problems, [
    'proof "twice": the mutation matches apps/api/src/a.ts 2 times, it must match exactly once',
    'proof "never": the mutation matches apps/api/src/b.ts 0 times, it must match exactly once',
    'proof "web": the mutation must be in apps/api/src (the proof job rebuilds the API only)',
    'proof "gone": the command runs e2e/gone.mjs, which does not exist',
    'duplicate proof id "gone"',
    'proof "gone": the mutation changes nothing',
    'proof "gone": expect is empty; without it any failure would count as the gate catching the mutant',
  ])
})

test('applying a mutation replaces the one match and refuses any other count', () => {
  assert.equal(applyMutation('a\n      freshAge: 0,\nb\n', proof().mutation), 'a\nb\n')
  assert.throws(() => applyMutation('a\nb\n', proof().mutation), /matches 0 times/)
})

test('the verdict: killed only when the gate failed with the expected message', () => {
  assert.equal(verdict(1, 'FAIL — … older than a day (403); see ADR-0027', 'older than a day (403)'), 'killed')
  assert.equal(verdict(0, 'PASS', 'older than a day (403)'), 'survived')
  // Red for another reason (the stack did not boot, another assertion): that proves nothing about this gate.
  assert.equal(verdict(1, 'timed out waiting for the API', 'older than a day (403)'), 'failed-differently')
})

test('each proof is one CI matrix entry that boots a stack and names its mutant', () => {
  assert.deepEqual(proofMatrixEntries({ proofs: [proof()] }), [
    { group: 'control-proof-fresh-age-default', title: 'control proof: freshAge back to the default', stack: true, fake_ki: false, mutant: 'fresh-age-default' },
  ])
})
