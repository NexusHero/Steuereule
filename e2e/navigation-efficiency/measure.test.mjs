// node --test e2e/navigation-efficiency/measure.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareTable } from './compare.mjs'

// measure.mjs imports a commit's harness at load time; the pure helpers are re-declared here
// through a dynamic import with a root that has the same harness.
const { budgetsFrom, checkBudgets } = await import('./measure.mjs')

const report = { personas: { lena: { korrektur: { interactions: 7, screens: 2, ms: 1000, slowestInteractionMs: 40 }, 'erster-durchlauf': { interactions: 261, screens: 30, ms: 16000, slowestInteractionMs: 80 } } } }

test('budgets are the measurement plus 10 %, rounded up (D5)', () => {
  assert.deepEqual(budgetsFrom(report), { lena: { korrektur: 8, 'erster-durchlauf': 288 } })
})

test('the gate fails only above the budget, and on a task that was not measured', () => {
  assert.deepEqual(checkBudgets(report, { lena: { korrektur: 7 } }), [])
  assert.equal(checkBudgets(report, { lena: { korrektur: 6 } }).length, 1)
  assert.equal(checkBudgets(report, { lena: { wiedereinstieg: 3 } }).length, 1)
})

test('the comparison table shows both variants and the difference', () => {
  const before = { personas: { lena: { korrektur: { interactions: 10, screens: 4, ms: 2700, slowestInteractionMs: 50 } } } }
  const table = compareTable(before, report)
  assert.match(table, /\| Lena \(#01\) \| Korrektur \| 10 \| 7 \| -3 \|/)
})
