import { describe, expect, it } from 'vitest'
import { checkSmallBusiness, estimateTradeTax, minimumMultiplierPercent, smallBusinessCutoff } from './business-taxes'

describe('small business rule (§ 19 UStG)', () => {
  it('uses 25.000 € and 100.000 € from 2025, 22.000 € and 50.000 € before', () => {
    expect(checkSmallBusiness({ year: 2025, priorYearTurnoverEur: 24_000, currentYearTurnoverEur: 60_000 })).toEqual({ eligible: true, priorYearLimitEur: 25_000, currentYearLimitEur: 100_000, crossed: null })
    expect(checkSmallBusiness({ year: 2024, priorYearTurnoverEur: 24_000, currentYearTurnoverEur: 30_000 })).toMatchObject({ eligible: false, crossed: 'prior_year' })
    expect(checkSmallBusiness({ year: 2026, priorYearTurnoverEur: 10_000, currentYearTurnoverEur: 100_001 })).toMatchObject({ eligible: false, crossed: 'current_year' })
  })

  it('annualises a part-year year before until 2024, not from 2025 (§ 19 Abs. 3 Satz 3 a. F., verified)', () => {
    // Started 1.7.: 12.000 € in six months are 24.000 € a year, above 22.000 €.
    expect(checkSmallBusiness({ year: 2024, priorYearTurnoverEur: 12_000, currentYearTurnoverEur: 10_000, priorYearMonthsActive: 6 })).toMatchObject({ eligible: false, crossed: 'prior_year' })
    expect(checkSmallBusiness({ year: 2025, priorYearTurnoverEur: 15_000, currentYearTurnoverEur: 10_000, priorYearMonthsActive: 6 })).toMatchObject({ eligible: true })
  })

  it('in the founding year from 2025 holds the running year to 25.000 €, with nothing to annualise (§ 19 Abs. 2 UStG)', () => {
    expect(checkSmallBusiness({ year: 2025, priorYearTurnoverEur: 0, currentYearTurnoverEur: 25_000, founding: { monthsActive: 3 } })).toEqual({ eligible: true, priorYearLimitEur: 25_000, currentYearLimitEur: 25_000, crossed: null })
    expect(checkSmallBusiness({ year: 2026, priorYearTurnoverEur: 0, currentYearTurnoverEur: 25_001, founding: { monthsActive: 12 } })).toMatchObject({ eligible: false, crossed: 'current_year' })
  })

  it('in the founding year until 2024 annualises the expected turnover and holds it to 22.000 € (Abschn. 19.1 Abs. 4 UStAE)', () => {
    // 6.000 € in three months are 24.000 € a year: above 22.000 €.
    expect(checkSmallBusiness({ year: 2024, priorYearTurnoverEur: 0, currentYearTurnoverEur: 6_000, founding: { monthsActive: 3 } })).toEqual({ eligible: false, priorYearLimitEur: 22_000, currentYearLimitEur: 22_000, crossed: 'current_year' })
    expect(checkSmallBusiness({ year: 2023, priorYearTurnoverEur: 0, currentYearTurnoverEur: 5_000, founding: { monthsActive: 3 } })).toMatchObject({ eligible: true })
  })
})

describe('trade tax overview (GewStG, § 35 EStG)', () => {
  it('rounds, takes the allowance off, and credits 4,0 × the base amount', () => {
    // 80.050 € → 80.000 € − 24.500 € = 55.500 € × 3,5 % = 1.942 € base amount; × 400 % = 7.768 €.
    expect(estimateTradeTax({ profitEur: 80_050, multiplierPercent: 400, personalCompany: true })).toEqual({ tradeIncomeEur: 80_000, baseAmountEur: 1_942, tradeTaxEur: 7_768, incomeTaxCreditEur: 7_768, netBurdenEur: 0 })
    // At 490 % the credit stays at 4,0 × 1.942 € = 7.768 € of 9.515 €.
    expect(estimateTradeTax({ profitEur: 80_050, multiplierPercent: 490, personalCompany: true })).toMatchObject({ tradeTaxEur: 9_515, incomeTaxCreditEur: 7_768, netBurdenEur: 1_747 })
  })

  it('owes nothing under the allowance and gives a corporation neither allowance nor credit', () => {
    expect(estimateTradeTax({ profitEur: 24_000, multiplierPercent: 400, personalCompany: true }).tradeTaxEur).toBe(0)
    expect(estimateTradeTax({ profitEur: 24_000, multiplierPercent: 400, personalCompany: false })).toMatchObject({ baseAmountEur: 840, tradeTaxEur: 3_360, incomeTaxCreditEur: 0 })
    expect(() => estimateTradeTax({ profitEur: 1, multiplierPercent: 150, personalCompany: true })).toThrow(RangeError)
  })
})

describe('the cut in the year the Kleinunternehmer limit is passed (§ 19 Abs. 1 Satz 1 UStG from 2025, statute read)', () => {
  const supplies = [
    { date: '2025-03-01', netEur: 60_000 },
    { date: '2025-09-15', netEur: 30_000 },
    { date: '2025-11-02', netEur: 20_000 },
    { date: '2025-12-01', netEur: 5_000 },
  ]

  it('taxes the supply that passes 100.000 € and all after it; the ones before stay tax-free', () => {
    expect(smallBusinessCutoff({ year: 2025, founding: false, supplies })).toBe('2025-11-02')
    expect(smallBusinessCutoff({ year: 2025, founding: true, supplies })).toBe('2025-03-01')
    expect(smallBusinessCutoff({ year: 2025, founding: false, supplies: supplies.slice(0, 2) })).toBeNull()
  })

  it('makes no cut up to 2024, where the limit was a forecast', () => {
    expect(smallBusinessCutoff({ year: 2024, founding: false, supplies })).toBeNull()
  })
})

describe('the minimum Hebesatz (§ 16 Abs. 4 Satz 2, § 36 Abs. 5b GewStG, statute read)', () => {
  it('is 200 % up to 2026 and 280 % from 2027', () => {
    expect(minimumMultiplierPercent(2026)).toBe(200)
    expect(minimumMultiplierPercent(2027)).toBe(280)
    expect(() => estimateTradeTax({ profitEur: 50_000, multiplierPercent: 250, personalCompany: true, year: 2027 })).toThrow(RangeError)
    expect(estimateTradeTax({ profitEur: 50_000, multiplierPercent: 250, personalCompany: true }).baseAmountEur).toBeGreaterThan(0)
  })
})
