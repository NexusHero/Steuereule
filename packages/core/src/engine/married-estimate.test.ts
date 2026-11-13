import { describe, expect, it } from 'vitest'
import { estimateMarriedCouple, type MarriedEstimateInput } from './married-estimate'
import { splittingTariff } from '../math/tarif'
import { kirchgeldFor } from '../domains/church-tax'

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
}

const EV = { kind: 'member', church: 'EV' } as const
const NONE = { kind: 'none' } as const
const church = (a: object, b: object, state: 'BE' | 'SN' | 'BY' | null = 'BE') =>
  ({ state, postalCode: null, a, b }) as NonNullable<MarriedEstimateInput['churchTax']>

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

  it('two Grenzgänger: no German church tax was withheld, so the church tax due lowers the result', () => {
    const crossBorder = (wage: number, withholding: number) =>
      ({ kind: 'crossBorder', wageEur: wage, swissWithholdingEur: withholding, pensionContributionsEur: 11709, otherProvisionEur: 3905, commuteAllowance: 6509, selfPaidHealthCare: 3000 }) as const
    const r = range({
      ...WEBER,
      a: crossBorder(134310, 6286),
      b: crossBorder(117150, 5272),
      rentalSurplus: 0,
      children: 2,
      childBenefit: 624,
      churchTax: church({ membership: EV, withheld: null }, { membership: EV, withheld: null }, null),
    })
    expect(r.anrechnung).toBe(6286 + 5272)
    if (r.churchTax.kind !== 'spanne') throw new Error('expected church tax')
    expect(r.churchTax.withheld).toBe(0)
    expect(r.churchTax.due.from).toBeGreaterThan(0)
    expect(r.result.to).toBeLessThan(0)
  })

  it('both members (Berlin): 9 % on the joint tax, the withheld church tax credited and deducted as Sonderausgabe', () => {
    const r = range({ ...WEBER, churchTax: church({ membership: EV, withheld: 800 }, { membership: EV, withheld: 900 }) })
    expect(r.specialExpenses).toBe(1700)
    if (r.churchTax.kind !== 'spanne') throw new Error('expected church tax')
    expect(r.churchTax.withheld).toBe(1700)
    expect(r.churchTax.due).toEqual({ from: Math.floor(r.incomeTax.from * 0.09), to: Math.floor(r.incomeTax.to * 0.09) })
    const credit = 9890 + 10420
    expect(r.result.from).toBe(credit - r.incomeTax.to - r.solidaritaetszuschlag.to + 1700 - r.churchTax.due.to)
  })

  it('§ 51a Abs. 2: the church tax is measured after the child allowances even when the Kindergeld wins', () => {
    const base = { ...WEBER, rentalSurplus: 0, a: { ...EMPLOYEE_A, grossWage: 40000 }, b: null, children: 2, childBenefit: 6120 }
    const churchFacts = church({ membership: EV, withheld: 300 }, { membership: EV, withheld: null })
    const r = range({ ...base, churchTax: churchFacts })
    expect(r.childAllowanceUsed).toBe(false)
    if (r.churchTax.kind !== 'spanne') throw new Error('expected church tax')
    const z = r.taxableIncome.to
    expect(r.churchTax.due.to).toBe(Math.floor(splittingTariff(z - 2 * 9600, 0, 2025) * 0.09))
    expect(r.churchTax.due.to).toBeLessThan(Math.floor(r.incomeTax.to * 0.09))
  })

  it('glaubensverschieden (Sachsen): church tax on the member share, or the besonderes Kirchgeld if higher', () => {
    const r = range({
      ...WEBER,
      a: { ...EMPLOYEE_A, grossWage: 20000, wageTax: 0 },
      b: { ...EMPLOYEE_B, grossWage: 110000, wageTax: 30000 },
      rentalSurplus: 0,
      churchTax: church({ membership: EV, withheld: 0 }, { membership: NONE, withheld: null }, 'SN'),
    })
    if (r.churchTax.kind !== 'spanne') throw new Error('expected church tax')
    // A earns little: their share of the joint tax is small (≈ 110 €), so the Kirchgeld of the step is due.
    expect(r.churchTax.due.to).toBe(kirchgeldFor(2025, r.taxableIncome.to))
    expect(r.churchTax.due.to).toBeGreaterThanOrEqual(540)
  })

  it('a spouse with unknown confession: "offen"; the church tax due stays out, the paid one is still a Sonderausgabe', () => {
    const r = range({ ...WEBER, churchTax: church({ membership: EV, withheld: 800 }, { membership: { kind: 'unknown' }, withheld: null }) })
    expect(r.churchTax).toEqual({ kind: 'offen', reason: 'konfession-fehlt' })
    expect(r.specialExpenses).toBe(800)
    expect(r.result.from).toBeGreaterThan(range(WEBER).result.from)
  })

  it('a member employee without the LStB church tax line: "offen"', () => {
    const r = range({ ...WEBER, churchTax: church({ membership: EV, withheld: null }, { membership: EV, withheld: 900 }) })
    expect(r.churchTax).toEqual({ kind: 'offen', reason: 'einbehalt-fehlt' })
  })

  it('both without a church: none', () => {
    const r = range({ ...WEBER, churchTax: church({ membership: NONE, withheld: null }, { membership: NONE, withheld: null }) })
    expect(r.churchTax).toEqual({ kind: 'none' })
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

describe('Werbungskosten of the couple', () => {
  it('reports what was deducted, the lump sum or the commute, per spouse', () => {
    // Both commutes (1.017 €, 550 €) are below the 1.230 € lump sum: 2 × 1.230 €.
    expect(estimateMarriedCouple(WEBER)).toMatchObject({ kind: 'spanne', werbungskosten: 2460 })
    const crossBorder = { kind: 'crossBorder', wageEur: 130000, swissWithholdingEur: 5800, pensionContributionsEur: 9000, otherProvisionEur: 2000, commuteAllowance: 6900, selfPaidHealthCare: 2252 } as const
    expect(estimateMarriedCouple({ ...WEBER, a: crossBorder, b: EMPLOYEE_B })).toMatchObject({ werbungskosten: 6900 + 1230 })
  })
})
