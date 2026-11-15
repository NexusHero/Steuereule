import { describe, expect, it } from 'vitest'
import type { CaseDigest } from './advisor'
import { deriveBasisAnswers } from './advisor-basis-facts'

const BASE: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
  crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
  answeredBasis: [],
}
const withLstb: CaseDigest = { ...BASE, lstbPersonA: { grossWageEur: 50000, wageTaxEur: 1, socialSecurityEur: 1 } }
const withCh: CaseDigest = { ...BASE, crossBorder: { ...BASE.crossBorder, grossWageChf: 90000 } }
const pension = { kind: 'gesetzlich', annualEur: 12000 }
const furtherBase = { answeredQuestions: 0, filingStatusAnswered: false, singleParent: false, pension, rentals: { rentEur: null, expensesEur: null, loanInterestEur: null }, capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null }, sideJobGrossEur: null, wageReplacementEur: null, severanceEur: null, healthCostsEur: null, householdServicesEur: null, filingDeadline: null, voluntaryFilingDeadline: null }

describe('deriveBasisAnswers', () => {
  it('proposes job Angestellt from a wage tax certificate', () => {
    expect(deriveBasisAnswers(withLstb).map((a) => [a.field, a.value])).toEqual([['job', 'Angestellt']])
  })
  it('proposes job and Switzerland from a Swiss salary statement', () => {
    expect(deriveBasisAnswers(withCh).map((a) => [a.field, a.value])).toEqual([['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz']])
  })
  it('names a pension as Rente only without wage', () => {
    const d = { ...BASE, furtherFacts: furtherBase }
    expect(deriveBasisAnswers(d).map((a) => a.value)).toEqual(['Rente'])
    expect(deriveBasisAnswers({ ...d, lstbPersonA: withLstb.lstbPersonA }).map((a) => a.value)).toEqual(['Angestellt'])
  })
  it('derives the children answer from recorded children (Strom-vs-chat v3, Richter)', () => {
    expect(deriveBasisAnswers({ ...BASE, childrenCount: 1 }).map((a) => [a.field, a.value])).toEqual([['kinder', '1 Kind']])
    expect(deriveBasisAnswers({ ...BASE, childrenCount: 3 }).map((a) => [a.field, a.value])).toEqual([['kinder', '2 oder mehr']])
    expect(deriveBasisAnswers({ ...BASE, childrenCount: 1, answeredBasis: ['kinder'] })).toEqual([])
    expect(deriveBasisAnswers(BASE)).toEqual([])
  })
  it('never overrides an existing answer', () => {
    expect(deriveBasisAnswers({ ...withCh, answeredBasis: ['job', 'ausland'] })).toEqual([])
    expect(deriveBasisAnswers({ ...withCh, answeredBasis: ['job'] }).map((a) => a.field)).toEqual(['ausland'])
  })
  it('derives nothing when it is unknown what was answered, or nothing is known', () => {
    const { answeredBasis: _drop, ...unknown } = withLstb
    expect(deriveBasisAnswers(unknown)).toEqual([])
    expect(deriveBasisAnswers(BASE)).toEqual([])
  })
})
