import { describe, expect, it } from 'vitest'
import type { CaseDigest } from './advisor'
import { unusedSavingsLevers } from './advisor-tasks'

const DIGEST: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 15,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

const ids = (digest: CaseDigest) => unusedSavingsLevers(digest).map((lever) => lever.id)

describe('unused savings levers (#501)', () => {
  it('always asks about what the app has no field for', () => {
    const levers = unusedSavingsLevers(DIGEST)
    for (const id of ['arbeitsmittel', 'pflege-behinderung', 'vorjahre']) {
      expect(levers.find((lever) => lever.id === id)?.state, id).toBe('unknown')
    }
  })

  it('reads household services, health costs and wage replacement off the case, now that the app has fields for them', () => {
    const further = { answeredQuestions: 5, filingStatusAnswered: true, singleParent: false, pension: null, rentals: { rentEur: null, expensesEur: null, loanInterestEur: null }, capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null }, sideJobGrossEur: null, severanceEur: null, filingDeadline: null, voluntaryFilingDeadline: null }
    const empty = unusedSavingsLevers({ ...DIGEST, furtherFacts: { ...further, wageReplacementEur: null, healthCostsEur: null, householdServicesEur: null } })
    expect(empty.find((lever) => lever.id === 'haushaltsnah')?.state).toBe('unused')
    expect(empty.find((lever) => lever.id === 'gesundheit')?.state).toBe('unused')
    expect(empty.some((lever) => lever.id === 'progressionsvorbehalt')).toBe(false)
    const filled = unusedSavingsLevers({ ...DIGEST, furtherFacts: { ...further, wageReplacementEur: 8000, healthCostsEur: 900, householdServicesEur: 1200 } })
    expect(filled.map((lever) => lever.id)).not.toEqual(expect.arrayContaining(['haushaltsnah']))
    expect(filled.some((lever) => lever.id === 'gesundheit')).toBe(false)
    expect(filled.find((lever) => lever.id === 'progressionsvorbehalt')?.state).toBe('unknown')
  })

  it('names a field the case leaves empty, and stops naming it once it is filled', () => {
    const empty: CaseDigest = { ...DIGEST, catalogExpenses: { ...DIGEST.catalogExpenses, donationsEur: null }, commuteAndWorkdays: { ...DIGEST.commuteAndWorkdays, homeOfficeDays: null } }
    expect(ids(empty)).toEqual(expect.arrayContaining(['spenden', 'homeoffice']))
    const filled: CaseDigest = { ...DIGEST, catalogExpenses: { ...DIGEST.catalogExpenses, donationsEur: 300 }, commuteAndWorkdays: { ...DIGEST.commuteAndWorkdays, homeOfficeDays: 80 } }
    expect(ids(filled)).not.toContain('spenden')
    expect(ids(filled)).not.toContain('homeoffice')
  })

  it('adds the levers of the user’s situation only when it applies', () => {
    const plain: CaseDigest = { ...DIGEST, childrenCount: 0, rentalObjectsCount: 0, filingStatus: 'einzel', crossBorder: { ...DIGEST.crossBorder, isCrossBorderCh: false } }
    for (const id of ['kinder', 'vermietung', 'veranlagungsart', 'grenzgaenger']) expect(ids(plain), id).not.toContain(id)
    const family: CaseDigest = { ...plain, childrenCount: 2, rentalObjectsCount: 1, filingStatus: 'zusammen', crossBorder: { ...DIGEST.crossBorder, isCrossBorderCh: true } }
    expect(ids(family)).toEqual(expect.arrayContaining(['kinder', 'vermietung', 'veranlagungsart', 'grenzgaenger']))
  })

  it('asks for the amount of a training the user only said yes to', () => {
    const yes: CaseDigest = { ...DIGEST, catalogExpenses: { ...DIGEST.catalogExpenses, hasTraining: true, trainingCostsEur: null } }
    expect(ids(yes)).toContain('fortbildung-betrag')
    expect(ids(yes)).not.toContain('fortbildung')
  })
})
