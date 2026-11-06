import { describe, expect, it } from 'vitest'
import { estimateMarriedCouple, type MarriedEstimateInput } from './married-estimate'
import { splittingTarif } from './tarif'

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

function spanne(input: MarriedEstimateInput) {
  const result = estimateMarriedCouple(input)
  if (result.kind !== 'spanne') throw new Error('expected a range')
  return result
}

describe('estimateMarriedCouple (ADR-0054)', () => {
  it('taxes the joint income with the splitting tariff and credits both wage taxes', () => {
    const r = spanne(WEBER)
    const income = 82000 - 1230 + (48000 - 1230) + 24600
    const zveBest = income - Math.round(15473 * 0.93) - Math.round(10008 * 0.93) - 72
    expect(r.zuVersteuerndesEinkommen.von).toBe(zveBest)
    expect(r.einkommensteuer.von).toBe(splittingTarif(zveBest, 0, 2025))
    expect(r.anrechnung).toBe(9890 + 10420)
    expect(r.ergebnis.von).toBeLessThanOrEqual(r.ergebnis.bis)
  })

  it('a rental surplus raises the tax', () => {
    expect(spanne(WEBER).einkommensteuer.von).toBeGreaterThan(spanne({ ...WEBER, rentalSurplus: 0 }).einkommensteuer.von)
  })

  it('uses the child allowance only when it saves more than the Kindergeld, and then adds the Kindergeld back', () => {
    const low = spanne({ ...WEBER, rentalSurplus: 0, a: { ...EMPLOYEE_A, grossWage: 30000 }, b: null, children: 2, childBenefit: 6120 })
    expect(low.childAllowanceUsed).toBe(false)

    const high = spanne({ ...WEBER, children: 2, childBenefit: 6120 })
    expect(high.childAllowanceUsed).toBe(true)
    const z = high.zuVersteuerndesEinkommen.von
    expect(high.einkommensteuer.von).toBe(splittingTarif(z - 2 * 9600, 0, 2025) + 6120)
  })

  it('two Grenzgänger: credits the Swiss withholding tax, no German Kirchensteuer withheld so it is part of the result', () => {
    const crossBorder = (wage: number, withholding: number) =>
      ({ kind: 'crossBorder', wageEur: wage, swissWithholdingEur: withholding, pensionContributionsEur: 11709, otherProvisionEur: 3905, commuteAllowance: 6509, selfPaidHealthCare: 3000 }) as const
    const r = spanne({ ...WEBER, a: crossBorder(134310, 6286), b: crossBorder(117150, 5272), rentalSurplus: 0, children: 2, childBenefit: 624, churchMember: true })
    expect(r.anrechnung).toBe(6286 + 5272)
    expect(r.churchTaxOpen).toBe(false)
    expect(r.churchTax.von).toBeGreaterThan(0)
    expect(r.ergebnis.bis).toBeLessThan(0)
  })

  it('leaves Kirchensteuer out of the result when German wage tax (and with it unknown Kirchensteuer) was withheld', () => {
    const r = spanne({ ...WEBER, churchMember: true })
    expect(r.churchTaxOpen).toBe(true)
    expect(r.ergebnis).toEqual(spanne(WEBER).ergebnis)
  })

  it('declines years without a tariff', () => {
    expect(estimateMarriedCouple({ ...WEBER, year: 2019 })).toEqual({ kind: 'nicht-moeglich', grund: 'jahr-ohne-tarif' })
  })
})
