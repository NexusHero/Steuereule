import { describe, expect, it } from 'vitest'
import { estimateMarriedCouple, type MarriedEstimateInput } from './married-estimate'
import { splittingTariff } from '../math/tarif'

const EMPLOYEE_A = { kind: 'employee', grossWage: 82000, wageTax: 9890, socialSecurity: 15473, commuteAllowance: 1017, selfPaidHealthCare: 0 } as const
const EMPLOYEE_B = { kind: 'employee', grossWage: 48000, wageTax: 10420, socialSecurity: 10008, commuteAllowance: 550, selfPaidHealthCare: 0 } as const

const WEBER: MarriedEstimateInput = {
  year: 2025,
  a: EMPLOYEE_A,
  b: EMPLOYEE_B,
  children: 0,
  childBenefit: 0,
  rentalSurplus: 24600,
  donations: 0,
  churchMember: false,
}

function range(input: MarriedEstimateInput) {
  const result = estimateMarriedCouple(input)
  if (result.kind !== 'spanne') throw new Error('expected a range')
  return result
}

describe('estimateMarriedCouple (ADR-0054)', () => {
  it('taxes the joint income with the splitting tariff and credits both wage taxes', () => {
    const r = range(WEBER)
    const income = 82000 - 1230 + (48000 - 1230) + 24600
    const zveBest = income - Math.round(15473 * 0.93) - Math.round(10008 * 0.93) - 72
    expect(r.taxableIncome.from).toBe(zveBest)
    expect(r.incomeTax.from).toBe(splittingTariff(zveBest, 0, 2025))
    expect(r.anrechnung).toBe(9890 + 10420)
    expect(r.result.from).toBeLessThanOrEqual(r.result.to)
  })

  it('a rental surplus raises the tax', () => {
    expect(range(WEBER).incomeTax.from).toBeGreaterThan(range({ ...WEBER, rentalSurplus: 0 }).incomeTax.from)
  })

  it('uses the child allowance only when it saves more than the Kindergeld, and then adds the Kindergeld back', () => {
    const low = range({ ...WEBER, rentalSurplus: 0, a: { ...EMPLOYEE_A, grossWage: 30000 }, b: null, children: 2, childBenefit: 6120 })
    expect(low.childAllowanceUsed).toBe(false)

    const high = range({ ...WEBER, children: 2, childBenefit: 6120 })
    expect(high.childAllowanceUsed).toBe(true)
    const z = high.taxableIncome.from
    expect(high.incomeTax.from).toBe(splittingTariff(z - 2 * 9600, 0, 2025) + 6120)
  })

  it('two Grenzgänger: credits the Swiss withholding tax, no German Kirchensteuer withheld so it is part of the result', () => {
    const crossBorder = (wage: number, withholding: number) =>
      ({ kind: 'crossBorder', wageEur: wage, swissWithholdingEur: withholding, pensionContributionsEur: 11709, otherProvisionEur: 3905, commuteAllowance: 6509, selfPaidHealthCare: 3000 }) as const
    const r = range({ ...WEBER, a: crossBorder(134310, 6286), b: crossBorder(117150, 5272), rentalSurplus: 0, children: 2, childBenefit: 624, churchMember: true })
    expect(r.anrechnung).toBe(6286 + 5272)
    expect(r.churchTaxOpen).toBe(false)
    expect(r.churchTax.from).toBeGreaterThan(0)
    expect(r.result.to).toBeLessThan(0)
  })

  it('leaves Kirchensteuer out of the result when German wage tax (and with it unknown Kirchensteuer) was withheld', () => {
    const r = range({ ...WEBER, churchMember: true })
    expect(r.churchTaxOpen).toBe(true)
    expect(r.result).toEqual(range(WEBER).result)
  })

  it('declines years without a tariff', () => {
    expect(estimateMarriedCouple({ ...WEBER, year: 2019 })).toEqual({ kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' })
  })

  it('deducts § 33 extraordinary burden above reasonable threshold and applies § 35a reduction (capped at 0 tarif tax)', () => {
    const base = range(WEBER)
    const withBurden = range({ ...WEBER, healthExpensesEur: 12000 })
    expect(withBurden.taxableIncome.from).toBeLessThan(base.taxableIncome.from)

    const withHousehold = range({ ...WEBER, householdReductionEur: 1500 })
    expect(withHousehold.incomeTax.from).toBe(base.incomeTax.from - 1500)

    const highWithChildAllowance = range({ ...WEBER, children: 2, childBenefit: 6120 })
    const highWithHugeReduction = range({ ...WEBER, children: 2, childBenefit: 6120, householdReductionEur: 200000 })
    // § 35a reduces tarifliche ESt down to 0, while Kindergeld Hinzurechnung (§ 31 EStG) remains.
    expect(highWithHugeReduction.incomeTax.from).toBe(6120)
    expect(highWithChildAllowance.incomeTax.from).toBeGreaterThan(6120)
  })
})
