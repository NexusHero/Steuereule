import { describe, expect, it } from 'vitest'
import {
  commuterAllowanceFrom,
  evaluateAdvisorTurn,
  extractAmountNear,
  simulateAdvisorFieldDelta,
  statedHomeOfficeDays,
  workAllowancesOf,
  type CaseDigest,
} from './advisor'

const base: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
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
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: 'Nie', homeOfficeDays: 0, distanceKm: 20 },
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
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: 420,
}

const withWork = (work: Partial<CaseDigest['commuteAndWorkdays']>, year = 2025): CaseDigest => ({
  ...base,
  taxYear: year,
  commuteAndWorkdays: { ...base.commuteAndWorkdays, ...work },
})

describe('commuterAllowanceFrom', () => {
  it('is zero without workdays or without a distance', () => {
    expect(commuterAllowanceFrom(0, 30, 2025)).toBe(0)
    expect(commuterAllowanceFrom(100, 0, 2025)).toBe(0)
    expect(commuterAllowanceFrom(-5, 30, 2025)).toBe(0)
  })

  it('pays 0,30 € for the first 20 km and 0,38 € above until 2025 (§ 9 Abs. 1 Nr. 4 EStG)', () => {
    // 100 days × (20 km × 0,30 + 10 km × 0,38) = 100 × 9,80
    expect(commuterAllowanceFrom(100, 30, 2025)).toBe(980)
  })

  it('pays 0,38 € from the first kilometre from 2026', () => {
    expect(commuterAllowanceFrom(100, 30, 2026)).toBe(1140)
  })

  it('falls back to the 2025 rates without a year or for an unsupported year', () => {
    expect(commuterAllowanceFrom(100, 30)).toBe(980)
    expect(commuterAllowanceFrom(100, 30, 2001)).toBe(980)
  })
})

describe('workAllowancesOf', () => {
  it('splits the workdays into commute days and the stated home-office days', () => {
    const work = workAllowancesOf(withWork({ workdays: 200, homeOfficeDays: 50, distanceKm: 10 }))
    expect(work.homeOfficeDays).toBe(50)
    expect(work.homeOfficeEur).toBe(300)
    expect(work.commuteDays).toBe(150)
    // 150 days × 10 km × 0,30 €
    expect(work.commuteEur).toBe(450)
  })

  it('has no commute amount while the distance is missing', () => {
    expect(workAllowancesOf(withWork({ distanceKm: null })).commuteEur).toBeNull()
  })

  it('derives the days from the answer "Fast immer", capped at the 210-day maximum', () => {
    const work = workAllowancesOf(withWork({ workdays: null, homeOfficeDays: null, homeOfficeAnswer: 'Fast immer' }))
    expect(work.homeOfficeDays).toBe(210)
    expect(work.homeOfficeEur).toBe(1260)
    // default of 220 workdays, 210 of them at home
    expect(work.commuteDays).toBe(10)
  })

  it('derives about 30 % of the workdays from "1–2 Tage pro Woche"', () => {
    const work = workAllowancesOf(withWork({ homeOfficeDays: null, homeOfficeAnswer: '1–2 Tage pro Woche' }))
    expect(work.homeOfficeDays).toBe(66)
    expect(work.commuteDays).toBe(154)
  })

  it('assumes no home-office day for any other answer', () => {
    expect(workAllowancesOf(withWork({ homeOfficeDays: null, homeOfficeAnswer: 'Nie' })).homeOfficeDays).toBe(0)
    expect(workAllowancesOf(withWork({ homeOfficeDays: null, homeOfficeAnswer: null })).homeOfficeDays).toBe(0)
  })

  it('uses the 2022 limits of 5 € and 120 days', () => {
    const work = workAllowancesOf(withWork({ homeOfficeDays: 200 }, 2022))
    expect(work.homeOfficeDays).toBe(120)
    expect(work.homeOfficeEur).toBe(600)
  })

  it('uses the current limits of 6 € and 210 days for a year without parameters', () => {
    const fast = workAllowancesOf(withWork({ workdays: 220, homeOfficeDays: null, homeOfficeAnswer: 'Fast immer' }, 2001))
    expect(fast.homeOfficeDays).toBe(210)
    expect(fast.homeOfficeEur).toBe(1260)
    const stated = workAllowancesOf(withWork({ homeOfficeDays: 300 }, 2001))
    expect(stated.homeOfficeDays).toBe(210)
    expect(stated.homeOfficeEur).toBe(1260)
  })
})

describe('simulateAdvisorFieldDelta: what the mask holds now', () => {
  const full: CaseDigest = {
    ...base,
    commuteAndWorkdays: { workdays: 210, homeOfficeAnswer: 'Fast immer', homeOfficeDays: 12, distanceKm: 33 },
    catalogExpenses: {
      hasTraining: true,
      trainingCostsEur: 640,
      relocationCostsEur: 1500,
      donationsEur: 80,
      selfPaidKvPvEur: null,
      riesterEur: 300,
      doubleHouseholdRentEur: 7200,
      workExpenses: { professionalBodiesEur: 120, workEquipmentEur: null },
    },
    furtherFacts: { healthCostsEur: 900 } as CaseDigest['furtherFacts'],
    crossBorder: {
      isCrossBorderCh: false,
      grossWageChf: null,
      withholdingTaxChf: null,
      pillar3aChf: 7000,
      healthInsuranceChf: 4200,
      dailySicknessBenefitChf: 300,
      nonReturnDays: null,
    },
  }
  const prev = (screen: Parameters<typeof simulateAdvisorFieldDelta>[1], field: string, d: CaseDigest = full) =>
    simulateAdvisorFieldDelta(d, screen, field, '1').previousValue

  it('reads each interview field as the user entered it', () => {
    expect(prev('interview', 'spenden-betrag')).toBe('80')
    expect(prev('interview', 'gesundheit-betrag')).toBe('900')
    expect(prev('interview', 'spenden')).toBe('Ja')
    expect(prev('interview', 'homeoffice')).toBe('Fast immer')
    expect(prev('interview', 'weg')).toBe('33')
    expect(prev('interview', 'tage')).toBe('210')
    expect(prev('interview', 'fortbildung')).toBe('Ja')
    expect(prev('interview', 'fortbildung-kosten')).toBe('640')
    expect(prev('interview', 'umzug-kosten')).toBe('1500')
    expect(prev('interview', 'dhf-miete')).toBe('7200')
    expect(prev('interview', 'riester-betrag')).toBe('300')
  })

  it('reads the commute-mask and the Lohnsteuerbescheinigung fields', () => {
    expect(prev('commute', 'oneWayKm')).toBe('33')
    expect(prev('commute', 'homeOfficeDays')).toBe('12')
    expect(prev('commute', 'professionalBodiesEur')).toBe('120')
    expect(prev('lstb', 'bruttoarbeitslohn')).toBe('65000')
    expect(prev('lstb', 'lohnsteuer')).toBe('12500')
    expect(prev('lstb', 'sozialversicherung')).toBe('12000')
  })

  it('reads the Swiss Lohnausweis fields', () => {
    expect(prev('chLohnausweis', 'krankenkasseChf')).toBe('4200')
    expect(prev('chLohnausweis', 'krankentaggeldChf')).toBe('300')
    expect(prev('chLohnausweis', 'saeule3aChf')).toBe('7000')
  })

  it('reads nothing that is not entered, and nothing for an unknown field', () => {
    const empty = base
    expect(prev('interview', 'spenden-betrag', empty)).toBeNull()
    expect(prev('interview', 'gesundheit-betrag', empty)).toBeNull()
    expect(prev('interview', 'spenden', empty)).toBe('Nein')
    expect(prev('interview', 'fortbildung', empty)).toBe('Nein')
    expect(prev('interview', 'fortbildung-kosten', empty)).toBeNull()
    expect(prev('interview', 'umzug-kosten', empty)).toBeNull()
    expect(prev('interview', 'dhf-miete', empty)).toBeNull()
    expect(prev('interview', 'riester-betrag', empty)).toBeNull()
    expect(prev('commute', 'professionalBodiesEur', empty)).toBeNull()
    expect(prev('commute', 'workEquipmentEur')).toBeNull()
    expect(prev('interview', 'no-such-field')).toBeNull()
    expect(prev('lstb', 'no-such-field')).toBeNull()
  })

  it('reads a missing distance, workday count and Lohnsteuerbescheinigung as not entered', () => {
    const open: CaseDigest = {
      ...base,
      lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
      commuteAndWorkdays: { workdays: null, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: null },
    }
    expect(prev('interview', 'weg', open)).toBeNull()
    expect(prev('interview', 'tage', open)).toBeNull()
    expect(prev('commute', 'oneWayKm', open)).toBeNull()
    expect(prev('commute', 'homeOfficeDays', open)).toBeNull()
    expect(prev('lstb', 'bruttoarbeitslohn', open)).toBeNull()
    expect(prev('lstb', 'lohnsteuer', open)).toBeNull()
    expect(prev('lstb', 'sozialversicherung', open)).toBeNull()
    expect(prev('chLohnausweis', 'krankenkasseChf', open)).toBeNull()
    expect(prev('chLohnausweis', 'krankentaggeldChf', open)).toBeNull()
    expect(prev('chLohnausweis', 'saeule3aChf', open)).toBeNull()
  })
})

describe('simulateAdvisorFieldDelta: what a new value does to the refund', () => {
  const delta = (screen: Parameters<typeof simulateAdvisorFieldDelta>[1], field: string, value: string, d: CaseDigest = base) =>
    simulateAdvisorFieldDelta(d, screen, field, value).deltaEur

  it('a higher gross wage with the same withheld tax lowers the refund; more Lohnsteuer or Sozialversicherung raises it', () => {
    expect(delta('lstb', 'bruttoarbeitslohn', '80000')).toBeLessThan(0)
    expect(delta('lstb', 'lohnsteuer', '15000')).toBeGreaterThan(0)
    expect(delta('lstb', 'sozialversicherung', '15000')).toBeGreaterThan(0)
  })

  it('never lets a negative entry go below zero', () => {
    expect(delta('lstb', 'lohnsteuer', '-500')).toBe(delta('lstb', 'lohnsteuer', '0'))
  })

  it('treats an entry without digits as 0', () => {
    expect(delta('interview', 'spenden-betrag', 'abc')).toBe(delta('interview', 'spenden-betrag', '0'))
  })

  it('counts further work expenses and the commute-mask distance and home-office days', () => {
    expect(delta('commute', 'workEquipmentEur', '900')).toBeGreaterThan(0)
    expect(delta('commute', 'oneWayKm', '35')).toBeGreaterThan(0)
    // Home-office days replace commute days, so with a long distance more days can lower the sum.
    const noCommute = withWork({ distanceKm: 0 })
    expect(delta('commute', 'homeOfficeDays', '100', noCommute)).toBeGreaterThanOrEqual(0)
  })

  it('counts costs entered on the interview screens', () => {
    expect(delta('interview', 'umzug-kosten', '2500')).toBeGreaterThan(0)
    expect(delta('interview', 'dhf-miete', '6000')).toBeGreaterThan(0)
    expect(delta('interview', 'riester-betrag', '800')).toBeGreaterThan(0)
    expect(delta('interview', 'tage', '230')).toBeGreaterThan(0)
    expect(delta('interview', 'weg', '40')).toBeGreaterThan(0)
  })

  it('a training "Nein" or "Ja" without costs changes nothing, with costs it does', () => {
    expect(delta('interview', 'fortbildung', 'Ja')).toBe(0)
    const trained: CaseDigest = { ...base, catalogExpenses: { ...base.catalogExpenses, hasTraining: true, trainingCostsEur: 900 } }
    expect(delta('interview', 'fortbildung', 'Nein', trained)).toBeLessThan(0)
  })

  it('reads "Fast immer" as home-office days that replace commute days', () => {
    // At 30 km a commute day is worth 9,80 €, a home-office day 6 €: swapping 210 days lowers the refund.
    const far = withWork({ distanceKm: 30 })
    const fast = simulateAdvisorFieldDelta(far, 'interview', 'homeoffice', 'Fast immer')
    const never = simulateAdvisorFieldDelta(far, 'interview', 'homeoffice', 'Nie')
    expect(fast.afterRefundEur).toBeLessThan(never.afterRefundEur)
    expect(never.deltaEur).toBe(0)
  })

  it('leaves the refund alone for an unknown field or for fields the simulation does not know', () => {
    expect(delta('interview', 'no-such-field', '100')).toBe(0)
    expect(delta('chLohnausweis', 'saeule3aChf', '100')).toBe(0)
  })

  describe('cross-border commuters', () => {
    const grenz: CaseDigest = {
      ...base,
      crossBorder: {
        isCrossBorderCh: true,
        grossWageChf: 100000,
        withholdingTaxChf: null,
        pillar3aChf: null,
        healthInsuranceChf: null,
        dailySicknessBenefitChf: null,
        nonReturnDays: null,
      },
    }

    it('raises the refund with the Swiss health insurance and the daily sickness benefit', () => {
      expect(delta('chLohnausweis', 'krankenkasseChf', '4200', grenz)).toBeGreaterThan(0)
      expect(delta('chLohnausweis', 'krankentaggeldChf', '600', grenz)).toBeGreaterThanOrEqual(0)
    })

    it('counts home-office days with their daily rate next to the commute', () => {
      const noCommute = { ...grenz, commuteAndWorkdays: { ...grenz.commuteAndWorkdays, distanceKm: 0 } }
      // 210 days × 6 € = 1.260 €, just above the Arbeitnehmer-Pauschbetrag
      expect(delta('commute', 'homeOfficeDays', '210', noCommute)).toBeGreaterThan(0)
    })

    it('uses the stated withholding tax and donations', () => {
      const stated: CaseDigest = {
        ...grenz,
        crossBorder: { ...grenz.crossBorder, withholdingTaxChf: 4000 },
        commuteAndWorkdays: { workdays: null, homeOfficeAnswer: '1–2 Tage pro Woche', homeOfficeDays: null, distanceKm: null },
      }
      expect(delta('interview', 'spenden-betrag', '500', stated)).toBeGreaterThan(0)
    })
  })
})

describe('extractAmountNear', () => {
  it('returns null when the topic is not named at all', () => {
    expect(extractAmountNear('Ich habe 250 € bezahlt', /spend/i)).toBeNull()
  })

  it('ignores a zero amount', () => {
    expect(extractAmountNear('0 € gespendet', /spend/i)).toBeNull()
  })
})

describe('statedHomeOfficeDays', () => {
  it('reads the day count the user named', () => {
    expect(statedHomeOfficeDays('an 40 Tagen im Homeoffice')).toBe(40)
    expect(statedHomeOfficeDays('an 40 Homeoffice-Tagen')).toBe(40)
  })

  it('reads no day count from zero days or from no number at all', () => {
    expect(statedHomeOfficeDays('an 0 Tagen')).toBeNull()
    expect(statedHomeOfficeDays('manchmal im Homeoffice')).toBeNull()
  })
})

describe('the home-office fallback turn', () => {
  it('mentions the days already in the file when no count is stated', () => {
    const turn = evaluateAdvisorTurn({ message: 'Was ist mit dem Homeoffice?', digest: withWork({ homeOfficeDays: 40 }) })
    expect(turn.replyText).toContain('In deiner Akte stehen bisher 40 Homeoffice-Tage (240 €).')
    expect(turn.meta.action).toBeUndefined()
  })

  it('names the 2022 limits for that year', () => {
    const turn = evaluateAdvisorTurn({ message: 'Was ist mit dem Homeoffice?', digest: withWork({}, 2022) })
    expect(turn.replyText).toContain('Tagespauschale von 5 €')
    expect(turn.replyText).toContain('höchstens 120 Tage = 600 € im Jahr')
  })

  it('falls back to the current limits for a year without parameters', () => {
    const turn = evaluateAdvisorTurn({ message: 'Ich war an 80 Tagen im Homeoffice', digest: withWork({}, 2001) })
    expect(turn.replyText).toContain('80 Tage × 6 € = 480 €')
    expect(turn.replyText).toContain('höchstens 210 Tage = 1.260 € im Jahr')
  })

  it('says the days stay below the Arbeitnehmer-Pauschbetrag when the whole sum does', () => {
    // 200 days × 6 € = 1.200 € and no commute day left: below the 1.230 € the tax office applies anyway.
    const turn = evaluateAdvisorTurn({ message: 'Ich war an 200 Tagen im Homeoffice', digest: withWork({ distanceKm: 8, workdays: 100, homeOfficeDays: 0 }) })
    expect(turn.replyText).toContain('rund 1.200 € – weniger als der Arbeitnehmer-Pauschbetrag von 1.230 €')
  })

  it('says only the part above the Pauschbetrag acts when the days lift the sum over it', () => {
    // Before: no expenses at all. After: 210 days × 6 € = 1.260 €, above 1.230 €.
    const turn = evaluateAdvisorTurn({ message: 'Ich war an 210 Tagen im Homeoffice', digest: withWork({ distanceKm: 0, homeOfficeDays: 0 }) })
    expect(turn.replyText).toContain('Ein Teil davon geht im Arbeitnehmer-Pauschbetrag von 1.230 € auf')
    expect(turn.replyText).not.toContain('weniger als der Arbeitnehmer-Pauschbetrag')
  })

  it('adds no Pauschbetrag remark for cross-border commuters', () => {
    const grenz: CaseDigest = { ...withWork({ distanceKm: 0 }), crossBorder: { ...base.crossBorder, isCrossBorderCh: true } }
    const turn = evaluateAdvisorTurn({ message: 'Ich war an 80 Tagen im Homeoffice', digest: grenz })
    expect(turn.replyText).not.toContain('Arbeitnehmer-Pauschbetrag')
  })
})
