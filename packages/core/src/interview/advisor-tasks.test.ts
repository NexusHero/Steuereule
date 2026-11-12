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
    for (const id of ['haushaltsnah', 'arbeitsmittel', 'gesundheit', 'vorjahre']) {
      expect(levers.find((lever) => lever.id === id)?.state, id).toBe('unknown')
    }
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
