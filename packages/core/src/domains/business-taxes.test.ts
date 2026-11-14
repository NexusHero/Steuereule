import { describe, expect, it } from 'vitest'
import { checkSmallBusiness, estimateTradeTax } from './business-taxes'

describe('small business rule (§ 19 UStG)', () => {
  it('uses 25.000 € and 100.000 € from 2025, 22.000 € and 50.000 € before', () => {
    expect(checkSmallBusiness({ year: 2025, priorYearTurnoverEur: 24_000, currentYearTurnoverEur: 60_000 })).toEqual({ eligible: true, priorYearLimitEur: 25_000, currentYearLimitEur: 100_000, crossed: null })
    expect(checkSmallBusiness({ year: 2024, priorYearTurnoverEur: 24_000, currentYearTurnoverEur: 30_000 })).toMatchObject({ eligible: false, crossed: 'prior_year' })
    expect(checkSmallBusiness({ year: 2026, priorYearTurnoverEur: 10_000, currentYearTurnoverEur: 100_001 })).toMatchObject({ eligible: false, crossed: 'current_year' })
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
