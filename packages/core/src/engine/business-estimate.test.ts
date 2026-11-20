import { describe, expect, it } from 'vitest'
import { tradeTaxReturn } from '../domains/business/trade-tax'
import { carryBackLoss } from '../domains/business/losses'
import type { PersonProvision } from '../domains/provision'
import { estimateMarriedCouple } from './married-estimate'
import { taxEstimateEmployee, taxEstimateSelfEmployed } from './tax-estimate'

/** A freelancer in the statutory health insurance without Krankengeld: 6.000 € health, 1.200 € care. */
const provision: PersonProvision = {
  pensionOwnEur: 0,
  pensionEmployerEur: 0,
  healthBasicEur: 6_000,
  healthWithSickPayEur: 0,
  careEur: 1_200,
  employerSubsidyEur: 0,
  otherEur: 0,
  reducedOtherCap: false,
}

describe('Anlage S through the whole estimate', () => {
  it('a translator with 60.000 € profit in 2024', () => {
    // Profit 60.000 € = GdE (no loss). Vorsorge 6.000 + 1.200 = 7.200 €; Sonderausgaben-Pauschbetrag 36 €.
    // zvE 60.000 − 7.200 − 36 = 52.764 €. § 32a 2024: z = (52.764 − 17.005) / 10.000 = 3,5759;
    // (181,19 × 3,5759 + 2.397) × 3,5759 + 991,21 = 11.879,53 → 11.879 €. No § 35 (no trade).
    // Soli: 11.879 € ≤ 18.130 € exemption limit → 0. Prepaid 10.000 € → 1.879 € to pay.
    const estimate = taxEstimateSelfEmployed({ year: 2024, business: { selfEmployedEur: 60_000 }, provision, donations: 0, prepayments: { incomeTaxEur: 10_000 } })
    expect(estimate).toMatchObject({
      kind: 'spanne',
      provision: { from: 7_200, to: 7_200 },
      taxableIncome: { from: 52_764, to: 52_764 },
      incomeTax: { from: 11_879, to: 11_879 },
      solidaritaetszuschlag: { from: 0, to: 0 },
      anrechnung: 10_000,
      result: { from: -1_879, to: -1_879 },
      business: { selfEmployedEur: 60_000, tradeEur: 0, gdeEur: 60_000, tradeTaxCredit: { from: 0, to: 0 } },
    })
  })
})

describe('Anlage G through the whole estimate', () => {
  it('a trader with 150.050 € profit in 2025: GewSt, § 35 and a lower Soli', () => {
    // GewSt: 150.050 → 150.000 − 24.500 = 125.500 € × 3,5 % = 4.392,50 → 4.392 €; × 410 % = 18.007,20 €.
    const gewst = tradeTaxReturn({ year: 2025, profitEur: 150_050, multiplierPercent: 410 })
    expect(gewst).toMatchObject({ baseAmountEur: 4_392, tradeTaxEur: 18_007.2 })
    // zvE 150.050 − 7.200 − 36 = 142.814 €; § 32a 2025: 0,42 × 142.814 − 10.911,92 = 49.069,96 → 49.069 €.
    // § 35: 4,0 × 4.392 = 17.568 € (below the 18.007,20 € due); ceiling 150.050 / 150.050 × 49.069 € → 17.568 €.
    // ESt 49.069 − 17.568 = 31.501 €. Soli on it: min(5,5 % × 31.501 = 1.732, 11,9 % × (31.501 − 19.950) = 1.374) = 1.374 €
    // (without § 35 it would be 2.698 €). Prepaid 30.000 € ESt and 1.000 € Soli → 30.000 + 1.000 − 31.501 − 1.374 = −1.875 €.
    const estimate = taxEstimateSelfEmployed({
      year: 2025,
      business: { tradeEur: 150_050, tradeTax: [{ baseAmountEur: gewst.baseAmountEur, tradeTaxEur: gewst.tradeTaxEur }] },
      provision,
      donations: 0,
      prepayments: { incomeTaxEur: 30_000, soliEur: 1_000 },
    })
    expect(estimate).toMatchObject({
      taxableIncome: { from: 142_814, to: 142_814 },
      incomeTax: { from: 31_501, to: 31_501 },
      solidaritaetszuschlag: { from: 1_374, to: 1_374 },
      result: { from: -1_875, to: -1_875 },
      business: { tradeTaxCredit: { from: 17_568, to: 17_568 } },
    })
  })

  it('measures the church tax on the tax before § 35 (§ 51a Abs. 2 Satz 3 EStG)', () => {
    const church = { membership: { kind: 'member' as const, church: 'EV' as const }, state: 'BY' as const, postalCode: '80331', withheld: 0, children: 0 }
    const withCredit = taxEstimateSelfEmployed({ year: 2025, business: { tradeEur: 150_050, tradeTax: [{ baseAmountEur: 4_392, tradeTaxEur: 18_007.2 }] }, provision, donations: 0, churchTax: church })
    const without = taxEstimateSelfEmployed({ year: 2025, business: { tradeEur: 150_050 }, provision, donations: 0, churchTax: church })
    if (withCredit.kind !== 'spanne' || without.kind !== 'spanne') throw new Error('expected a range')
    expect(withCredit.churchTax?.kind).toBe('spanne')
    expect(withCredit.churchTax).toEqual(without.churchTax)
    expect(without.incomeTax.from - withCredit.incomeTax.from).toBe(17_568)
  })

  it('caps § 35 by the share of trade income when a wage sits beside the trade', () => {
    // Trade 20.000 € beside a wage of 60.000 € (Werbungskosten 1.230 €): ceiling = 20.000 / 78.770 of the tariff tax.
    const estimate = taxEstimateEmployee({
      year: 2026,
      bruttoarbeitslohn: 60_000,
      lohnsteuer: 9_000,
      sozialversicherung: 12_000,
      commuterAllowance: 0,
      otherIncomeRelatedExpenses: 0,
      donations: 0,
      selfPaidKvPv: 0,
      business: { tradeEur: 20_000, tradeTax: [{ baseAmountEur: 0, tradeTaxEur: 0 }] },
    })
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    // 20.000 € is below the GewSt allowance: Messbetrag 0, so nothing to credit.
    expect(estimate.business?.tradeTaxCredit).toEqual({ from: 0, to: 0 })
    const withMessbetrag = taxEstimateEmployee({
      year: 2026,
      bruttoarbeitslohn: 60_000,
      lohnsteuer: 9_000,
      sozialversicherung: 12_000,
      commuterAllowance: 0,
      otherIncomeRelatedExpenses: 0,
      donations: 0,
      selfPaidKvPv: 0,
      business: { tradeEur: 20_000, tradeTax: [{ baseAmountEur: 2_000, tradeTaxEur: 8_000 }] },
    })
    if (withMessbetrag.kind !== 'spanne') throw new Error('expected a range')
    const credit = withMessbetrag.business?.tradeTaxCredit.from ?? 0
    const tariffTax = withMessbetrag.incomeTax.from + credit
    expect(credit).toBeCloseTo(Math.floor(((20_000 / 78_770) * tariffTax) * 100) / 100, 2)
    expect(credit).toBeLessThan(8_000)
  })
})

describe('a loss year with Rücktrag and Vortrag', () => {
  it('declares the rest at the end of 2025 and uses it in 2026', () => {
    // 2025: Anlage S −20.000 €. 2024 offers 12.000 € → 12.000 € go back, 8.000 € forward; 3.000 € carried from before.
    const back = carryBackLoss({ lossYear: 2025, lossEur: 20_000, joint: false, roomEur: [12_000, 0], waive: false })
    const lossYear = taxEstimateSelfEmployed({
      year: 2025,
      business: { selfEmployedEur: -20_000 },
      losses: { carriedForwardEur: 3_000, carriedBackOfThisLossEur: back.intoYearBeforeEur + back.intoSecondYearBeforeEur },
      provision,
      donations: 0,
    })
    expect(lossYear).toMatchObject({ taxableIncome: { from: 0, to: 0 }, incomeTax: { from: 0, to: 0 }, business: { gdeEur: -20_000, losses: { newLossEur: 20_000, remainingCarryForwardEur: 11_000 } } })

    // 2026: profit 40.000 € less 11.000 € = 29.000 €; zvE 29.000 − 7.200 − 36 = 21.764 €.
    // § 32a 2026: z = (21.764 − 17.799) / 10.000 = 0,3965; (173,10 × 0,3965 + 2.397) × 0,3965 + 1.034,87 = 2.012,49 → 2.012 €.
    const nextYear = taxEstimateSelfEmployed({ year: 2026, business: { selfEmployedEur: 40_000 }, losses: { carriedForwardEur: 11_000 }, provision, donations: 0 })
    expect(nextYear).toMatchObject({ taxableIncome: { from: 21_764, to: 21_764 }, incomeTax: { from: 2_012, to: 2_012 }, business: { losses: { carryForwardDeductedEur: 11_000, remainingCarryForwardEur: 0 } } })
  })

  it('offsets a business loss against the wage of the same year', () => {
    const base = { year: 2024, bruttoarbeitslohn: 50_000, lohnsteuer: 8_000, sozialversicherung: 10_000, commuterAllowance: 0, otherIncomeRelatedExpenses: 0, donations: 0, selfPaidKvPv: 0 }
    const plain = taxEstimateEmployee(base)
    const withLoss = taxEstimateEmployee({ ...base, business: { selfEmployedEur: -5_000 } })
    if (plain.kind !== 'spanne' || withLoss.kind !== 'spanne') throw new Error('expected a range')
    expect(plain.taxableIncome.from - withLoss.taxableIncome.from).toBe(5_000)
    expect(plain.business).toBeUndefined()
  })
})

describe('married couple with a trade', () => {
  it('credits § 35 on the joint tax and lowers the Soli, not the church tax', () => {
    const input = {
      year: 2023,
      a: { kind: 'employee' as const, grossWage: 50_000, wageTax: 6_500, socialSecurity: 10_000, commuteAllowance: 0, selfPaidHealthCare: 0 },
      b: { kind: 'selfEmployed' as const, provision },
      children: 0,
      childBenefit: 0,
      rentalSurplus: 0,
      donations: 0,
    }
    // 100.050 € → 100.000 − 24.500 = 75.500 € × 3,5 % = 2.642 €; × 400 % = 10.568 €.
    const gewst = tradeTaxReturn({ year: 2023, profitEur: 100_050, multiplierPercent: 400 })
    const withCredit = estimateMarriedCouple({ ...input, business: { b: { tradeEur: 100_050, tradeTax: [{ baseAmountEur: gewst.baseAmountEur, tradeTaxEur: gewst.tradeTaxEur }] } } })
    const without = estimateMarriedCouple({ ...input, business: { b: { tradeEur: 100_050 } } })
    if (withCredit.kind !== 'spanne' || without.kind !== 'spanne') throw new Error('expected a range')
    expect(gewst.baseAmountEur).toBe(2_642)
    // The ceiling (100.050 / 148.820 of the tax) is above 4,0 × 2.642 = 10.568 €, so the full volume is credited.
    expect(withCredit.business?.tradeTaxCredit.from).toBe(10_568)
    expect(without.incomeTax.from - withCredit.incomeTax.from).toBe(10_568)
    expect(withCredit.solidaritaetszuschlag.from).toBeLessThan(without.solidaritaetszuschlag.from)
  })
})
