import { describe, expect, it } from 'vitest'
import type { CaseDigest, CaseFurtherFacts } from './advisor'
import { advisorOpeningStage, caseFingerprint, hasIncomeWithAmount, openingFigures, openingGaps } from './advisor-opening'

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
    const reordered = JSON.parse(JSON.stringify(a, Object.keys(a).reduceRight<string[]>((keys, key) => [...keys, key], []))) as CaseDigest
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

describe('hasIncomeWithAmount', () => {
  it.each([
    ['a Swiss wage', { crossBorder: { isCrossBorderCh: true, grossWageChf: 90_000, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null } }, {}],
    ['a capital gain', { capitalGainEur: 1_200 }, {}],
    ['a side job', {}, { sideJobGrossEur: 4_000 }],
  ])('counts %s as an income', (_name, overrides, further) => {
    expect(hasIncomeWithAmount(digest(overrides, further))).toBe(true)
  })

  it('counts no income without any amount, and none when the further facts are unknown', () => {
    expect(hasIncomeWithAmount(digest())).toBe(false)
    const unknown: CaseDigest = { ...digest(), furtherFacts: undefined }
    expect(hasIncomeWithAmount(unknown)).toBe(false)
    expect(openingGaps(unknown)).toHaveLength(2)
    expect(advisorOpeningStage({ ...unknown, childrenCount: 1 })).toBe('partial')
    expect(advisorOpeningStage({ ...unknown, rentalObjectsCount: 1 })).toBe('partial')
  })
})

describe('caseFingerprint of unset values', () => {
  it('ignores a property that is set to undefined, but not one that is null', () => {
    const a = digest(WAGE)
    expect(caseFingerprint({ ...a, profession: undefined }, '', [])).toBe(caseFingerprint(a, '', []))
    expect(caseFingerprint({ ...a, childrenAges: [4, 7] }, '', [])).not.toBe(caseFingerprint({ ...a, childrenAges: [7, 4] }, '', []))
  })
})

describe('openingFigures', () => {
  const COMMUTER = { commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: 10 } }

  it('names only what the app can compute: the lump sum, and the commute where the distance is entered', () => {
    // 2026: 0,38 € per kilometre from the first one; 220 days × 10 km × 0,38 €
    expect(openingFigures(digest(COMMUTER), null)).toEqual([
      { id: 'entfernungspauschale', label: 'Entfernungspauschale für 220 Tage an der Arbeitsstätte', amountEur: 836 },
      { id: 'arbeitnehmer-pauschbetrag', label: 'Arbeitnehmer-Pauschbetrag (gilt automatisch)', amountEur: 1230 },
    ])
  })

  it('names no commute while the distance is missing', () => {
    expect(openingFigures(digest(), null).map((figure) => figure.id)).toEqual(['arbeitnehmer-pauschbetrag'])
  })

  it('adds the estimate and the part of the Werbungskosten above the lump sum', () => {
    const figures = openingFigures(digest(), { resultFromEur: 100.4, resultToEur: 300.6, incomeRelatedExpensesEur: 2000 })
    expect(figures.map((figure) => [figure.id, figure.amountEur])).toEqual([
      ['ergebnis-von', 100],
      ['ergebnis-bis', 301],
      ['arbeitnehmer-pauschbetrag', 1230],
      ['werbungskosten', 2000],
      ['werbungskosten-ueber-pauschbetrag', 770],
    ])
  })

  it('has nothing above the lump sum when the Werbungskosten stay below it', () => {
    const figures = openingFigures(digest(), { resultFromEur: 0, resultToEur: 0, incomeRelatedExpensesEur: 400 })
    expect(figures.find((figure) => figure.id === 'werbungskosten-ueber-pauschbetrag')?.amountEur).toBe(0)
  })

  it('names the home-office allowance and shortens the commute by those days', () => {
    const figures = openingFigures(
      digest({ commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: 'Fast immer', homeOfficeDays: null, distanceKm: 10 } }),
      null,
    )
    // 210 days × 6 €, leaving 10 commute days × 10 km × 0,38 €
    expect(figures.find((figure) => figure.id === 'homeoffice-pauschale')).toMatchObject({ amountEur: 1260, label: 'Homeoffice-Tagespauschale für 210 Tage' })
    expect(figures.find((figure) => figure.id === 'entfernungspauschale')?.amountEur).toBe(38)
  })

  it('names no lump sum and no Werbungskosten for a year without parameters', () => {
    const figures = openingFigures(digest({ taxYear: 2001 }), { resultFromEur: 10, resultToEur: 20, incomeRelatedExpensesEur: 2000 })
    expect(figures.map((figure) => figure.id)).toEqual(['ergebnis-von', 'ergebnis-bis'])
  })
})
