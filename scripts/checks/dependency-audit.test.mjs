import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluate } from './dependency-audit.mjs'

const advisory = (severity, ...paths) => ({
  github_advisory_id: 'GHSA-test',
  module_name: 'pkg',
  severity,
  patched_versions: '>=2',
  findings: [{ paths }],
})
const rule = (expires) => [{ name: 'tooling', pattern: /^apps__mobile-web>expo>@expo\//, reason: 'x', expires }]

test('a high advisory in the API blocks', () => {
  const { blocking } = evaluate({ advisories: { 1: advisory('high', 'apps__api>nodemailer') } }, '2026-11-24', rule('2027-01-01'))
  assert.equal(blocking.length, 1)
})

test('moderate advisories do not block', () => {
  const { blocking } = evaluate({ advisories: { 1: advisory('moderate', 'apps__api>nodemailer') } }, '2026-11-24', rule('2027-01-01'))
  assert.equal(blocking.length, 0)
})

test('an advisory found only on allowlisted paths is accepted', () => {
  const { blocking, accepted } = evaluate({ advisories: { 1: advisory('critical', 'apps__mobile-web>expo>@expo/cli>x') } }, '2026-11-24', rule('2027-01-01'))
  assert.equal(blocking.length, 0)
  assert.equal(accepted.get('tooling'), 1)
})

test('one non-allowlisted path is enough to block', () => {
  const report = { advisories: { 1: advisory('high', 'apps__mobile-web>expo>@expo/cli>x', 'apps__api>x') } }
  assert.equal(evaluate(report, '2026-11-24', rule('2027-01-01')).blocking.length, 1)
})

test('an expired rule blocks again and is reported', () => {
  const report = { advisories: { 1: advisory('high', 'apps__mobile-web>expo>@expo/cli>x') } }
  const result = evaluate(report, '2027-03-01', rule('2027-01-01'))
  assert.equal(result.blocking.length, 1)
  assert.equal(result.expired.length, 1)
})
