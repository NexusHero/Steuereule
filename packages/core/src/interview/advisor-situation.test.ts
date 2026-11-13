import { describe, expect, it } from 'vitest'
import type { CaseDigest } from './advisor'
import { ADVISOR_SITUATION_MAX_CHARS, ageAtEndOfYear, describeSituationForPrompt, tidySituationText } from './advisor-situation'

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

describe('the household’s situation (#501)', () => {
  it('keeps the user’s lines, drops blank runs and stray spaces, and lets an empty text clear it', () => {
    expect(tidySituationText('  Wir bauen 2027.  \n\n\n\nElternzeit   ab März. ')).toEqual({ ok: true, text: 'Wir bauen 2027.\n\nElternzeit ab März.' })
    expect(tidySituationText('   ')).toEqual({ ok: true, text: '' })
  })

  it('refuses a text that is too long', () => {
    expect(tidySituationText('a'.repeat(ADVISOR_SITUATION_MAX_CHARS + 1)).ok).toBe(false)
    expect(tidySituationText('a'.repeat(ADVISOR_SITUATION_MAX_CHARS)).ok).toBe(true)
  })

  it('reads an age from an ISO or a German birth date, and nothing from anything else', () => {
    expect(ageAtEndOfYear('2019-05-04', 2025)).toBe(6)
    expect(ageAtEndOfYear('04.05.2019', 2025)).toBe(6)
    expect(ageAtEndOfYear('irgendwann', 2025)).toBeNull()
    expect(ageAtEndOfYear('2030-01-01', 2025)).toBeNull()
  })

  it('tells the model the case in words, with the children’s ages and without a name', () => {
    const text = describeSituationForPrompt({ ...DIGEST, filingStatus: 'zusammen', childrenCount: 2, childrenAges: [3, 7] }, undefined)
    expect(text).toContain('Veranlagung: zusammen')
    expect(text).toContain('Kinder: 2 (Alter am Jahresende: 3, 7)')
    expect(text).toContain('suggest_situation')
  })

  it('puts the user’s own words in, and then no longer asks for them', () => {
    const text = describeSituationForPrompt(DIGEST, 'Wir bauen 2027 ein Haus.')
    expect(text).toContain('In eigenen Worten des Nutzers')
    expect(text).toContain('Wir bauen 2027 ein Haus.')
    expect(text).not.toContain('noch nicht beschrieben')
  })
})

describe('describeSituationForPrompt: the further facts (ADR-0067 §11)', () => {
  const further = {
    answeredQuestions: 6,
    filingStatusAnswered: true,
    singleParent: false,
    pension: null,
    rentals: { rentEur: null, expensesEur: null, loanInterestEur: null },
    capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null },
    sideJobGrossEur: null,
    wageReplacementEur: null,
    severanceEur: 20_000,
    healthCostsEur: null,
    householdServicesEur: null,
    leave: { vacationDays: 30, sickDays: 3 },
    filingDeadline: '2027-08-02',
    voluntaryFilingDeadline: '2030-12-31',
  }

  it('says the leave days are entered, so the owl never calls them missing', () => {
    const text = describeSituationForPrompt({ ...DIGEST, furtherFacts: further }, '')
    expect(text).toContain('30 Urlaubs- und 3 Krankheitstagen (beides eingetragen)')
  })

  it('names only what is entered, and the deadlines', () => {
    const text = describeSituationForPrompt({ ...DIGEST, furtherFacts: further }, '')
    expect(text).toContain('Abfindung: rund 20000 €')
    expect(text).not.toContain('Nebenjob')
    expect(text).toContain('2027-08-02')
  })
})
