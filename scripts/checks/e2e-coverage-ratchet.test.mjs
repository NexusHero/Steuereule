// node --test scripts/checks/e2e-coverage-ratchet.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareToBaseline, uncoveredPairs, uncoveredTestIds, withoutExceptions } from './e2e-coverage-ratchet.mjs'

const e2e = (plain, templates = [], files = []) => ({ plain: new Set(plain), templates, byFile: new Map(files.map(([name, src]) => [name, { src, literals: new Set([...src.matchAll(/'([^']*)'/g)].map((m) => m[1])) }])) })

test('a testID is covered by an exact literal, a prefix selector or a template', () => {
  const ids = [
    { id: 'cockpit-weiter', pattern: null },
    { id: 'jahr-2026', pattern: null },
    { id: 'katalog-option-spenden-Ja', pattern: null },
    { id: 'lonely-button', pattern: null },
  ]
  const gaps = uncoveredTestIds(ids, e2e(['cockpit-weiter', '^=jahr-'], [{ text: 'katalog-option-${step}-Ja', file: 'x' }]))
  assert.deepEqual(gaps, ['lonely-button'])
})

test('a templated testID is covered by an E2E literal that matches it', () => {
  const id = { id: 'wie-vorjahr-${step}', pattern: /^wie-vorjahr-.+$/ }
  assert.deepEqual(uncoveredTestIds([id], e2e(['wie-vorjahr-spenden'])), [])
  assert.deepEqual(uncoveredTestIds([id], e2e(['something-else'])), ['wie-vorjahr-${step}'])
})

test('an interview pair is covered by a UI testID, an API tuple or a picks table', () => {
  const pairs = [
    { step: 'job', value: 'Angestellt' },
    { step: 'umzug', value: 'Ja' },
    { step: 'ch-wohnsitz', value: 'Schweiz' },
    { step: 'dhf', value: 'Nein' },
  ]
  const gaps = uncoveredPairs(pairs, e2e(['interview-option-job-Angestellt'], [], [['a.mjs', `answer(api, [['umzug', 'Ja']]); const picks = { 'ch-wohnsitz': 'Schweiz' }`]]))
  assert.deepEqual(gaps, ['dhf=Nein'])
})

test('an unquoted key in a picks table counts too', () => {
  assert.deepEqual(uncoveredPairs([{ step: 'gewerbe', value: 'weiter' }], e2e([], [], [['a.mjs', `const gate = { job: 'Beides', gewerbe: 'weiter' }`]])), [])
})

test('documented exceptions drop out, exactly or by prefix', () => {
  assert.deepEqual(withoutExceptions(['partner=Ja', 'partner=Nein', 'job=Rente'], { 'partner=*': 'segment-2' }), ['job=Rente'])
  assert.deepEqual(withoutExceptions(['a', 'b'], { a: 'why' }), ['b'])
})

test('the ratchet fails on additions only; removals are progress', () => {
  const { added, removed } = compareToBaseline({ testIds: ['a', 'c'], interviewPairs: [] }, { testIds: ['a', 'b'], interviewPairs: ['x=1'] })
  assert.deepEqual(added, { testIds: ['c'], interviewPairs: [] })
  assert.deepEqual(removed, { testIds: ['b'], interviewPairs: ['x=1'] })
})
