// node --test e2e/scan-corpus/measure.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amountFrom, evaluate, score } from './measure.mjs'

const lstb = { file: 'a.pdf', variant: 'digital-pdf', layout: 'x', kind: 'lstb', expected: { bruttoarbeitslohn: 100, lohnsteuer: 10, sozialversicherung: 20.4 } }
const draft = (fields) => ({ kind: 'draft', ms: 100, fields })

test('amounts typed the German way', () => {
  assert.equal(amountFrom('54.320'), 54320)
  assert.equal(amountFrom('10.918,32'), 10918.32)
  assert.equal(amountFrom(''), null)
})

test('a wrong value without the check mark is a miss, with it it is "falsch, aber sicher"', () => {
  const unsure = score(lstb, draft({ bruttoarbeitslohn: { value: 100, sure: true }, lohnsteuer: { value: 11, sure: false }, sozialversicherung: { value: 20, sure: true } }))
  assert.equal(unsure.correct, 2)
  assert.equal(unsure.wrongButSure, 0)
  const sure = score(lstb, draft({ bruttoarbeitslohn: { value: 100, sure: true }, lohnsteuer: { value: 11, sure: true }, sozialversicherung: { value: 20, sure: true } }))
  assert.equal(sure.wrongButSure, 1)
})

test('a field cut off the document must not come back green', () => {
  const cut = { ...lstb, expected: { bruttoarbeitslohn: 100, lohnsteuer: 10 } }
  assert.equal(score(cut, draft({ bruttoarbeitslohn: { value: 100, sure: false }, lohnsteuer: { value: 10, sure: false }, sozialversicherung: { value: 5, sure: true } })).wrongButSure, 1)
})

test('a negative document fails on a green amount and on the wrong outcome', () => {
  const payslip = { file: 'n.pdf', variant: 'negativ-x', kind: 'negative', expectation: 'no-green-value' }
  assert.equal(score(payslip, draft({ bruttoarbeitslohn: { value: 3230, sure: true } })).wrongButSure, 1)
  const year = { ...payslip, expectation: 'year-conflict' }
  assert.equal(score(year, { kind: 'draft', ms: 1, fields: {} }).problems.length, 1)
})

test('digital PDFs need 100 %; every other variant needs 95 % (D3), no exceptions', () => {
  const photo = (correct) => ({ file: 'p.jpg', variant: 'foto-x', correct, total: 20, wrongButSure: 0, ms: 1000, problems: [] })
  assert.equal(evaluate([photo(19)], { zeroWriteViolations: 0, externalRequests: 0 }).violations.length, 0)
  assert.equal(evaluate([photo(18)], { zeroWriteViolations: 0, externalRequests: 0 }).violations.length, 1)
  const digital = { ...photo(19), variant: 'digital-pdf' }
  assert.equal(evaluate([digital], { zeroWriteViolations: 0, externalRequests: 0 }).violations.length, 1)
  assert.equal(evaluate([photo(20)], { zeroWriteViolations: 1, externalRequests: 1 }).violations.length, 2)
})
