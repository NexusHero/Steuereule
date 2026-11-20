import { describe, expect, it } from 'vitest'
import { estimateTradeTax } from '../business-taxes'
import { financingAddition, landDeduction, tradeTaxCredit, tradeTaxReturn } from './trade-tax'

describe('Hinzurechnungen and Kürzungen (§§ 8, 9 GewStG)', () => {
  it('adds a quarter of the financing components above 200.000 €', () => {
    // 150.000 interest + 100.000 / 5 + 120.000 / 2 + 40.000 / 4 = 150.000 + 20.000 + 60.000 + 10.000 = 240.000 €;
    // (240.000 − 200.000) / 4 = 10.000 €.
    expect(financingAddition({ debtChargesEur: 150_000, rentMovableEur: 100_000, rentImmovableEur: 120_000, licencesEur: 40_000 })).toEqual({ componentsEur: 240_000, additionEur: 10_000 })
    expect(financingAddition({ debtChargesEur: 12_000, rentImmovableEur: 18_000 }).additionEur).toBe(0)
  })

  it('deducts 1,2 % of 140 % of the Einheitswert until 2024 and the booked Grundsteuer from 2025', () => {
    // 50.000 € × 1,4 × 1,2 % = 840 €.
    expect(landDeduction(2024, { einheitswertEur: 50_000, landTaxEur: 900 })).toBe(840)
    expect(landDeduction(2025, { einheitswertEur: 50_000, landTaxEur: 900 })).toBe(900)
  })
})

describe('Gewerbesteuer of a sole trader (§§ 10a, 11, 16 GewStG)', () => {
  it('computes a case above the allowance', () => {
    // 80.050 € + 0 − 840 € = 79.210 € → 79.200 € − 24.500 € = 54.700 € × 3,5 % = 1.914,50 € → 1.914 €;
    // × 410 % = 7.847,40 €.
    const result = tradeTaxReturn({ year: 2024, profitEur: 80_050, landDeductionEur: 840, multiplierPercent: 410 })
    expect(result).toMatchObject({ tradeIncomeBeforeLossEur: 79_210, roundedTradeIncomeEur: 79_200, allowanceEur: 24_500, baseAmountEur: 1_914, tradeTaxEur: 7_847.4 })
  })

  it('owes nothing below the allowance, and the allowance never exceeds the income', () => {
    expect(tradeTaxReturn({ year: 2023, profitEur: 24_550, multiplierPercent: 400 })).toMatchObject({ roundedTradeIncomeEur: 24_500, allowanceEur: 24_500, baseAmountEur: 0, tradeTaxEur: 0 })
    expect(tradeTaxReturn({ year: 2023, profitEur: 9_999, multiplierPercent: 400 })).toMatchObject({ roundedTradeIncomeEur: 9_900, allowanceEur: 9_900 })
  })

  it('uses a Gewerbeverlust and carries a new one forward', () => {
    // 40.000 € less the loss of 15.000 € = 25.000 € → 500 € over the allowance × 3,5 % = 17,50 € → 17 €.
    expect(tradeTaxReturn({ year: 2025, profitEur: 40_000, lossCarriedForwardEur: 15_000, multiplierPercent: 400 })).toMatchObject({ lossUsedEur: 15_000, lossRemainingEur: 0, baseAmountEur: 17, tradeTaxEur: 68 })
    expect(tradeTaxReturn({ year: 2025, profitEur: -8_000, lossCarriedForwardEur: 2_000, multiplierPercent: 400 })).toMatchObject({ lossUsedEur: 0, lossRemainingEur: 10_000, tradeTaxEur: 0 })
  })

  it('matches the overview for a plain profit', () => {
    const overview = estimateTradeTax({ profitEur: 80_050, multiplierPercent: 400, personalCompany: true })
    const full = tradeTaxReturn({ year: 2026, profitEur: 80_050, multiplierPercent: 400 })
    expect(full.baseAmountEur).toBe(overview.baseAmountEur)
    expect(full.tradeTaxEur).toBe(overview.tradeTaxEur)
  })
})

describe('§ 35 EStG credit', () => {
  it('reproduces the ratio of BMF 3.11.2016 Rn. 17 (single person)', () => {
    // § 15: −50.000 + 120.000 = 70.000 €; Einkunftsart Gewerbebetrieb with § 17 (−30.000 €) = 40.000 €;
    // § 18: −100.000 € (not offset vertically); § 21: 100.000 €. Ceiling = 70.000 / 140.000 × tax.
    const credit = tradeTaxCredit(
      [{ income: { tradeEur: 70_000, tradeTypeTotalEur: 40_000, otherTypesEur: [-100_000, 100_000] }, businesses: [{ baseAmountEur: 10_000, tradeTaxEur: 40_000 }] }],
      30_000,
    )
    expect(credit).toEqual({ creditVolumeEur: 40_000, ceilingEur: 15_000, creditEur: 15_000 })
  })

  it('reproduces the ratio of BMF 3.11.2016 Rn. 18 (spouses, each checked on their own)', () => {
    // Husband: § 15 50.000 €, § 21 −30.000 €. Wife: § 15 −25.000 €, § 19 10.000 €, § 21 25.000 − 10.000 = 15.000 €.
    // Ceiling = 50.000 / 75.000 × 9.000 € = 6.000 €; the wife's Messbetrag drops out (Rn. 10).
    const credit = tradeTaxCredit(
      [
        { income: { tradeEur: 50_000, otherTypesEur: [-30_000] }, businesses: [{ baseAmountEur: 900, tradeTaxEur: 3_600 }] },
        { income: { tradeEur: -25_000, otherTypesEur: [10_000, 15_000] }, businesses: [{ baseAmountEur: 500, tradeTaxEur: 2_000 }] },
      ],
      9_000,
    )
    expect(credit).toEqual({ creditVolumeEur: 3_600, ceilingEur: 6_000, creditEur: 3_600 })
  })

  it('caps the credit at the trade tax due when the Hebesatz is below 400 %', () => {
    // Messbetrag 1.000 € × 4,0 = 4.000 €, but at 380 % only 3.800 € trade tax is due.
    expect(tradeTaxCredit([{ income: { tradeEur: 60_000, otherTypesEur: [] }, businesses: [{ baseAmountEur: 1_000, tradeTaxEur: 3_800 }] }], 20_000).creditEur).toBe(3_800)
  })
})
