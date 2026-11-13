import { describe, expect, it } from 'vitest'
import type { CaseDigest, CaseFurtherFacts } from './advisor'
import { advisorOpeningStage, caseFingerprint, openingGaps } from './advisor-opening'

const FURTHER: CaseFurtherFacts = {
  answeredQuestions: 0,
  filingStatusAnswered: false,
  singleParent: false,
  pension: null,
  rentals: { rentEur: null, expensesEur: null, loanInterestEur: null },
  capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null },
  sideJobGrossEur: null,
  wageReplacementEur: null,
  severanceEur: null,
  healthCostsEur: null,
  householdServicesEur: null,
  filingDeadline: '2027-07-31',
  voluntaryFilingDeadline: '2030-12-31',
}

function digest(overrides: Partial<CaseDigest> = {}, further: Partial<CaseFurtherFacts> = {}): CaseDigest {
  return {
    taxYear: 2026,
    filingStatus: 'einzel',
    lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
    crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
    commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: null },
    catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
    childrenCount: 0,
    rentalObjectsCount: 0,
    capitalGainEur: null,
    priorYearComparison: { donationsEur: null },
    openOwlHints: [],
    printoutMissingFields: [],
    estimatedRefundEur: null,
    furtherFacts: { ...FURTHER, ...further },
    ...overrides,
  }
}

const WAGE = { lstbPersonA: { grossWageEur: 52_000, wageTaxEur: 8_100, socialSecurityEur: 10_400 } }

describe('advisorOpeningStage', () => {
  it('is empty while nothing was entered, so no model is asked', () => {
    expect(advisorOpeningStage(digest())).toBe('empty')
  })

  it('is partial once something is entered but the income or the assessment is missing', () => {
    expect(advisorOpeningStage(digest({}, { answeredQuestions: 4 }))).toBe('partial')
    expect(advisorOpeningStage(digest(WAGE))).toBe('partial')
    expect(advisorOpeningStage(digest({ childrenCount: 1 }, { filingStatusAnswered: true }))).toBe('partial')
  })

  it('is ready with an income amount and the assessment', () => {
    expect(advisorOpeningStage(digest(WAGE, { filingStatusAnswered: true }))).toBe('ready')
    expect(advisorOpeningStage(digest({}, { filingStatusAnswered: true, pension: { kind: 'gesetzlich', annualEur: 18_000 } }))).toBe('ready')
    expect(advisorOpeningStage(digest({}, { filingStatusAnswered: true, rentals: { rentEur: 9_600, expensesEur: null, loanInterestEur: null } }))).toBe('ready')
  })

  it('does not count a zero as an income', () => {
    expect(advisorOpeningStage(digest({ lstbPersonA: { grossWageEur: 0, wageTaxEur: 0, socialSecurityEur: 0 } }, { filingStatusAnswered: true, answeredQuestions: 2 }))).toBe('partial')
  })
})

describe('openingGaps', () => {
  it('names the income and the assessment while they are missing', () => {
    expect(openingGaps(digest())).toHaveLength(2)
    expect(openingGaps(digest(WAGE))).toEqual([expect.stringMatching(/^Veranlagung/)])
    expect(openingGaps(digest(WAGE, { filingStatusAnswered: true }))).toEqual([])
  })
})

describe('caseFingerprint', () => {
  it('stays the same for the same case, whatever the key order', () => {
    const a = digest(WAGE, { filingStatusAnswered: true })
    const reordered = JSON.parse(JSON.stringify(a, Object.keys(a).toReversed())) as CaseDigest
    expect(caseFingerprint(a, 'Pendle 38 km', ['Notiz'])).toBe(caseFingerprint({ ...reordered, ...a }, ' Pendle 38 km ', ['Notiz']))
  })

  it('changes when a figure, the description or a note changes', () => {
    const base = caseFingerprint(digest(WAGE), '', [])
    expect(caseFingerprint(digest({ lstbPersonA: { ...WAGE.lstbPersonA, grossWageEur: 53_000 } }), '', [])).not.toBe(base)
    expect(caseFingerprint(digest(WAGE), 'Hauskauf 2027', [])).not.toBe(base)
    expect(caseFingerprint(digest(WAGE), '', ['Fortbildung geplant'])).not.toBe(base)
  })

  it('is eight hex characters, nothing of the case readable from it', () => {
    expect(caseFingerprint(digest(WAGE), 'Pendle 38 km', [])).toMatch(/^[0-9a-f]{8}$/)
  })
})
