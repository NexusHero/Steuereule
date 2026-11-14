import { describe, expect, it } from 'vitest'
import { taxEstimateEmployee, taxEstimateCrossBorder, taxEstimatePensioner, STATUTORY_PENSIONER_HEALTH_SHARE } from './tax-estimate'
import { estimateMarriedCouple } from './married-estimate'
import { incomeTax, progressionClauseTax } from '../math/tarif'

const EMPLOYED = {
  year: 2025,
  bruttoarbeitslohn: 48000,
  lohnsteuer: 7100,
  sozialversicherung: 9850,
  commuterAllowance: 0,
  otherIncomeRelatedExpenses: 0,
  donations: 250,
  selfPaidKvPv: 0,
}

describe('wage replacement benefits in the estimate (§ 32b EStG, UX review K3)', () => {
  it('keeps the range and raises the tax by the progression clause instead of giving up', () => {
    const without = taxEstimateEmployee(EMPLOYED)
    const withBenefit = taxEstimateEmployee({ ...EMPLOYED, wageReplacementEur: 3000 })
    expect(without.kind).toBe('spanne')
    expect(withBenefit.kind).toBe('spanne')
    if (without.kind !== 'spanne' || withBenefit.kind !== 'spanne') return
    expect(withBenefit.incomeTax.from).toBeGreaterThan(without.incomeTax.from)
    expect(withBenefit.result.to).toBeLessThan(without.result.to)
    expect(withBenefit.taxableIncome).toEqual(without.taxableIncome)
  })

  it('applies the special rate of § 32b Abs. 2 to the taxable income', () => {
    const estimate = taxEstimateEmployee({ ...EMPLOYED, wageReplacementEur: 3000 })
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    // No own Werbungskosten: the whole 1.230 € lump sum is unused and comes off the benefits.
    expect(estimate.incomeTax.from).toBe(progressionClauseTax(estimate.taxableIncome.from, 3000 - 1230, 2025))
    expect(estimate.incomeTax.to).toBe(progressionClauseTax(estimate.taxableIncome.to, 3000 - 1230, 2025))
  })

  it('reduces the benefit by the unused Arbeitnehmer-Pauschbetrag (§ 32b Abs. 2 Satz 1 Nr. 1 Buchst. a)', () => {
    // Actual Werbungskosten of 1.000 € leave 230 € of the 1.230 € lump sum unused.
    const estimate = taxEstimateEmployee({ ...EMPLOYED, commuterAllowance: 1000, wageReplacementEur: 3000 })
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.incomeTax.from).toBe(progressionClauseTax(estimate.taxableIncome.from, 3000 - 230, 2025))
  })

  it('applies to a Grenzgänger as well', () => {
    const base = {
      year: 2025,
      wageEur: 90000,
      withholdingTaxEur: 4000,
      retirementProvisionEur: 9000,
      otherProvisionEur: 1500,
      healthInsuranceEur: 3000,
      commuterAllowance: 0,
      donations: 0,
    }
    const without = taxEstimateCrossBorder(base)
    const withBenefit = taxEstimateCrossBorder({ ...base, wageReplacementEur: 5000 })
    if (without.kind !== 'spanne' || withBenefit.kind !== 'spanne') throw new Error('expected ranges')
    expect(withBenefit.incomeTax.from).toBeGreaterThan(without.incomeTax.from)
  })

  it('applies to a married couple on the splitting tariff', () => {
    const input = {
      year: 2025,
      a: { kind: 'employee' as const, grossWage: 48000, wageTax: 7100, socialSecurity: 9850, commuteAllowance: 0, selfPaidHealthCare: 0 },
      b: null,
      children: 0,
      childBenefit: 0,
      rentalSurplus: 0,
      donations: 0,
    }
    const without = estimateMarriedCouple(input)
    const withBenefit = estimateMarriedCouple({ ...input, wageReplacementEur: 12000 })
    if (without.kind !== 'spanne' || withBenefit.kind !== 'spanne') throw new Error('expected ranges')
    expect(withBenefit.incomeTax.from).toBeGreaterThan(without.incomeTax.from)
  })
})

describe('taxEstimatePensioner (Anlage R, UX review K3)', () => {
  const PENSIONER = {
    year: 2025,
    grossPensionEur: 18000,
    taxablePensionEur: 14040,
    donations: 0,
    selfPaidKvPv: 0,
  }

  it('estimates the tax on the taxable share less the 102 € lump sum, with nothing withheld', () => {
    const estimate = taxEstimatePensioner(PENSIONER)
    expect(estimate.kind).toBe('spanne')
    if (estimate.kind !== 'spanne') return
    expect(estimate.werbungskosten).toBe(102)
    expect(estimate.anrechnung).toBe(0)
    expect(estimate.result.from).toBeLessThanOrEqual(0)
    expect(estimate.result.to).toBeLessThanOrEqual(0)
  })

  it('deducts the statutory health and care insurance of pensioners (KVdR) as a range of the gross pension', () => {
    const estimate = taxEstimatePensioner(PENSIONER)
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.provision).toEqual({
      from: Math.round(18000 * STATUTORY_PENSIONER_HEALTH_SHARE.from),
      to: Math.round(18000 * STATUTORY_PENSIONER_HEALTH_SHARE.to),
    })
  })

  it('uses the self-paid contributions instead when the pensioner is insured privately', () => {
    const estimate = taxEstimatePensioner({ ...PENSIONER, selfPaidKvPv: 4200, privatelyInsured: true })
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.provision).toEqual({ from: 4200, to: 4200 })
  })

  it('shows a back payment for a high pension', () => {
    const estimate = taxEstimatePensioner({ ...PENSIONER, grossPensionEur: 40000, taxablePensionEur: 33000 })
    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    const zveHigh = 33000 - 102 - Math.round(40000 * STATUTORY_PENSIONER_HEALTH_SHARE.from) - 36
    expect(estimate.result.from).toBe(-incomeTax(zveHigh, 2025))
    expect(estimate.result.to).toBeLessThan(0)
  })

  it('declines years without a tariff', () => {
    expect(taxEstimatePensioner({ ...PENSIONER, year: 2019 }).kind).toBe('nicht-moeglich')
  })
})
