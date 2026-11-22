import { describe, expect, it } from 'vitest'
import { getTaxYearParameters } from '../math/tax-parameters'
import {
  DAILY_BENEFIT_SOURCES,
  ahvContributionFit,
  ahvContributionFitHint,
  dailyBenefitAmountField,
  dailyBenefitEntry,
  goesAgainstRecommendation,
  recommendedDailyBenefitSource,
} from './daily-benefit'

describe('the Swiss social security rates of the year', () => {
  it('has the employee AHV/IV/EO rate of 5,3 % and ALV 1,1 % up to 148.200 CHF in 2024 and 2025', () => {
    for (const year of [2024, 2025]) {
      expect(getTaxYearParameters(year).swissSocialSecurity).toEqual({ ahvIvEoEmployeeRate: 0.053, alvEmployeeRate: 0.011, alvMaxWageChf: 148200, alvSolidarityRate: 0 })
    }
  })

  it('still has the ALV solidarity contribution above 148.200 CHF in 2022', () => {
    expect(getTaxYearParameters(2022).swissSocialSecurity.alvSolidarityRate).toBe(0.005)
  })
})

describe('where the daily benefit in the gross wage came from: the field it goes to', () => {
  it('offers the six answers of the question', () => {
    expect(DAILY_BENEFIT_SOURCES).toEqual(['krankentaggeldversicherung', 'lohnfortzahlung', 'beides', 'unfallversicherung', 'mutterschaftIv', 'kein'])
  })

  it('takes a benefit of the collective sickness insurance out of the wage (sickness field)', () => {
    expect(dailyBenefitAmountField('krankentaggeldversicherung')).toBe('steuerfreiesKrankentaggeldChf')
    expect(dailyBenefitEntry('krankentaggeldversicherung', 4200)).toEqual({ taggeldQuelle: 'krankentaggeldversicherung', steuerfreiesKrankentaggeldChf: 4200, steuerfreiesUnfalltaggeldChf: null })
  })

  it('deducts nothing for the employer’s own continued pay: 0 in the sickness field', () => {
    expect(dailyBenefitAmountField('lohnfortzahlung')).toBeNull()
    // An amount typed by mistake is not deducted: continued pay is wage.
    expect(dailyBenefitEntry('lohnfortzahlung', 4200)).toEqual({ taggeldQuelle: 'lohnfortzahlung', steuerfreiesKrankentaggeldChf: 0, steuerfreiesUnfalltaggeldChf: null })
    expect(dailyBenefitEntry('kein', null)).toEqual({ taggeldQuelle: 'kein', steuerfreiesKrankentaggeldChf: 0, steuerfreiesUnfalltaggeldChf: null })
  })

  it('takes only the insurer’s part out for „beides“; the top-up stays wage', () => {
    expect(dailyBenefitAmountField('beides')).toBe('steuerfreiesKrankentaggeldChf')
    expect(dailyBenefitEntry('beides', 3360)).toEqual({ taggeldQuelle: 'beides', steuerfreiesKrankentaggeldChf: 3360, steuerfreiesUnfalltaggeldChf: null })
  })

  it('puts an accident benefit into its own field and clears the sickness field', () => {
    expect(dailyBenefitAmountField('unfallversicherung')).toBe('steuerfreiesUnfalltaggeldChf')
    expect(dailyBenefitEntry('unfallversicherung', 2250)).toEqual({ taggeldQuelle: 'unfallversicherung', steuerfreiesKrankentaggeldChf: null, steuerfreiesUnfalltaggeldChf: 2250 })
  })

  it('keeps maternity and IV benefits in the sickness field until they have a field of their own', () => {
    expect(dailyBenefitAmountField('mutterschaftIv')).toBe('steuerfreiesKrankentaggeldChf')
    expect(dailyBenefitEntry('mutterschaftIv', 5000)).toMatchObject({ steuerfreiesKrankentaggeldChf: 5000, steuerfreiesUnfalltaggeldChf: null })
  })

  it('leaves the amount open while it is not known', () => {
    expect(dailyBenefitEntry('beides', null)).toEqual({ taggeldQuelle: 'beides', steuerfreiesKrankentaggeldChf: null, steuerfreiesUnfalltaggeldChf: null })
  })
})

const fitOf = (input: Parameters<typeof ahvContributionFit>[0]) => {
  const fit = ahvContributionFit(input)
  if (fit === null) throw new Error('expected a fit')
  return fit
}

// Made-up figures. 2025: AHV/IV/EO 5,3 % and ALV 1,1 % (below 148.200 CHF) = 6,4 % of the AHV wage.
describe('ahvContributionFit: do the contributions of Ziffer 9 fit the wage with or without the benefit?', () => {
  it('says „without“ when Ziffer 9 is 6,4 % of the wage less the benefit (an insurance benefit is not AHV wage)', () => {
    // 90.000 − 6.000 = 84.000 → 4.452 + 924 = 5.376; with the benefit 4.770 + 990 = 5.760.
    const fit = fitOf({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 5380, candidateChf: 6000 })
    expect(fit).toMatchObject({ verdict: 'without', expectedWithChf: 5760, expectedWithoutChf: 5376, deviationWithChf: -380, deviationWithoutChf: 4 })
    expect(fit.marginChf).toBe(376)
    expect(ahvContributionFitHint(fit)).toContain('ohne das Taggeld')
    expect(ahvContributionFitHint(fit)).toContain('kein AHV-pflichtiger Lohn')
    expect(ahvContributionFitHint(fit)).toContain('keine Entscheidung')
  })

  it('says „with“ when Ziffer 9 is 6,4 % of the whole wage (the money was paid as wage)', () => {
    const fit = fitOf({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 5755, candidateChf: 6000 })
    expect(fit).toMatchObject({ verdict: 'with', deviationWithChf: -5, deviationWithoutChf: 379, marginChf: 374 })
    expect(ahvContributionFitHint(fit)).toContain('mit dem Taggeld')
    expect(ahvContributionFitHint(fit)).toContain('Lohnfortzahlung')
  })

  it('says „unclear“ when the benefit is too small to tell both apart', () => {
    // 300 CHF make 19 CHF of contributions: within the tolerance.
    const fit = fitOf({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 5750, candidateChf: 300 })
    expect(fit).toMatchObject({ verdict: 'unclear', reason: 'too_close' })
    expect(ahvContributionFitHint(fit)).toContain('nicht unterscheiden')
  })

  it('says „unclear“ when Ziffer 9 holds more than both, likely the NBU premium', () => {
    const fit = fitOf({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 6660, candidateChf: 6000 })
    expect(fit).toMatchObject({ verdict: 'unclear', reason: 'nbu_likely' })
    expect(ahvContributionFitHint(fit)).toContain('NBU')
  })

  it('says „unclear“ when Ziffer 9 is far below both', () => {
    expect(fitOf({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 3000, candidateChf: 6000 })).toMatchObject({ verdict: 'unclear', reason: 'fits_neither' })
  })

  it('leaves family allowances out of the AHV wage, as they are not AHV-subject', () => {
    // 90.000 − 2.400 allowances − 6.000 benefit = 81.600 → 5.222 (6,4 %).
    const fit = fitOf({ taxYear: 2025, grossWageChf: 90000, familyAllowancesChf: 2400, ahvContributionsChf: 5222, candidateChf: 6000 })
    expect(fit).toMatchObject({ verdict: 'without', expectedWithoutChf: 5222 })
  })

  it('gives nothing for a year without parameters', () => {
    expect(ahvContributionFit({ taxYear: 2019, grossWageChf: 90000, ahvContributionsChf: 5380, candidateChf: 6000 })).toBeNull()
  })

  it('caps the ALV at 148.200 CHF', () => {
    const fit = fitOf({ taxYear: 2025, grossWageChf: 200000, ahvContributionsChf: 0, candidateChf: 20000 })
    // 200.000 × 5,3 % + 148.200 × 1,1 % = 10.600 + 1.630; without: 9.540 + 1.630.
    expect(fit).toMatchObject({ expectedWithChf: 12230, expectedWithoutChf: 11170 })
  })
})

describe('the source the app recommends when the remark and Ziffer 9 agree', () => {
  // A real certificate, amounts only: a collective sickness benefit offset in the wage.
  const offset = ahvContributionFit({ taxYear: 2024, grossWageChf: 102736, ahvContributionsChf: 5205, candidateChf: 20843 })

  it('recommends the insurance for „KK-Taggeld Verrechnung“ when Ziffer 9 fits the wage without the benefit', () => {
    expect(offset).toMatchObject({ verdict: 'without' })
    expect(recommendedDailyBenefitSource('sickness', offset)).toBe('krankentaggeldversicherung')
  })

  it('recommends the accident insurance for an accident benefit that is not AHV wage', () => {
    expect(recommendedDailyBenefitSource('accident', offset)).toBe('unfallversicherung')
  })

  it('recommends nothing when one sign is missing or they do not agree', () => {
    const close = ahvContributionFit({ taxYear: 2025, grossWageChf: 115603, ahvContributionsChf: 7257, candidateChf: 3853 })
    expect(close).toMatchObject({ verdict: 'unclear' })
    expect(recommendedDailyBenefitSource('sickness', close)).toBeNull()
    const wage = ahvContributionFit({ taxYear: 2025, grossWageChf: 90000, ahvContributionsChf: 5760, candidateChf: 6000 })
    expect(wage).toMatchObject({ verdict: 'with' })
    expect(recommendedDailyBenefitSource('sickness', wage)).toBeNull()
    expect(recommendedDailyBenefitSource(null, offset)).toBeNull()
    expect(recommendedDailyBenefitSource('sickness', null)).toBeNull()
  })

  it('calls an answer that keeps the benefit as wage a contradiction to the recommendation', () => {
    expect(goesAgainstRecommendation('lohnfortzahlung', 'krankentaggeldversicherung')).toBe(true)
    expect(goesAgainstRecommendation('kein', 'krankentaggeldversicherung')).toBe(true)
    expect(goesAgainstRecommendation('beides', 'krankentaggeldversicherung')).toBe(false)
    expect(goesAgainstRecommendation('krankentaggeldversicherung', 'krankentaggeldversicherung')).toBe(false)
    expect(goesAgainstRecommendation('lohnfortzahlung', null)).toBe(false)
  })
})
