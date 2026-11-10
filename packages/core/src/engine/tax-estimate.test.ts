import { describe, expect, it } from 'vitest'
import { taxEstimateEmployee, taxEstimateCrossBorder } from './tax-estimate'
import { incomeTax } from '../math/tarif'

const EMPLOYED = {
  year: 2025,
  bruttoarbeitslohn: 45000,
  lohnsteuer: 6100,
  sozialversicherung: 9200,
  commuterAllowance: 0,
  otherIncomeRelatedExpenses: 0,
  donations: 200,
  selfPaidKvPv: 0,
}

describe('steuerschaetzungAngestellt', () => {
  it('estimates the refund as a range around the deductible share of the social security contributions', () => {
    const estimate = taxEstimateEmployee(EMPLOYED)

    expect(estimate.kind).toBe('spanne')
    if (estimate.kind !== 'spanne') return
    const zveBestCase = 45000 - 1230 - Math.round(9200 * 0.93) - 200
    const zveWorstCase = 45000 - 1230 - Math.round(9200 * 0.91) - 200
    expect(estimate.incomeTax).toEqual({ from: incomeTax(zveBestCase, 2025), to: incomeTax(zveWorstCase, 2025) })
    expect(estimate.result).toEqual({ from: 6100 - incomeTax(zveWorstCase, 2025), to: 6100 - incomeTax(zveBestCase, 2025) })
  })

  it('uses the Entfernungspauschale once it beats the Arbeitnehmer-Pauschbetrag', () => {
    const without = taxEstimateEmployee(EMPLOYED)
    const withValue = taxEstimateEmployee({ ...EMPLOYED, commuterAllowance: 2019 })

    if (without.kind !== 'spanne' || withValue.kind !== 'spanne') throw new Error('expected a range')
    expect(withValue.result.from).toBeGreaterThan(without.result.from)
    expect(withValue.werbungskosten).toBe(2019)
    expect(without.werbungskosten).toBe(1230)
  })

  it('counts at least the Sonderausgaben-Pauschbetrag of 36 €', () => {
    const estimate = taxEstimateEmployee({ ...EMPLOYED, donations: 0 })

    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.specialExpenses).toBe(36)
  })

  it('never goes below zero taxable income', () => {
    const estimate = taxEstimateEmployee({ ...EMPLOYED, bruttoarbeitslohn: 9000, lohnsteuer: 0, sozialversicherung: 1900 })

    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.incomeTax).toEqual({ from: 0, to: 0 })
  })

  it('declines years without a tariff instead of guessing', () => {
    const estimate = taxEstimateEmployee({ ...EMPLOYED, year: 2019 })

    expect(estimate).toEqual({ kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' })
  })
})

const CROSS_BORDER = {
  year: 2025,
  wageEur: 96300,
  withholdingTaxEur: 4334,
  retirementProvisionEur: 9678,
  otherProvisionEur: 1782,
  healthInsuranceEur: 0,
  commuterAllowance: 0,
  donations: 0,
}

describe('steuerschaetzungGrenzgaenger', () => {
  it('compares the German tax with the creditable Swiss withholding tax', () => {
    const estimate = taxEstimateCrossBorder(CROSS_BORDER)

    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.anrechnung).toBe(4334)
    expect(estimate.result.to).toBeLessThan(0)
    expect(estimate.result.from).toBeLessThanOrEqual(estimate.result.to)
  })

  it('deducts Altersvorsorge in full and sonstige Vorsorge only up to the Höchstbetrag (Anlage N-Gre Z. 82/85)', () => {
    const estimate = taxEstimateCrossBorder({ ...CROSS_BORDER, otherProvisionEur: 5000 })

    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.provision).toEqual({ from: 9678, to: 9678 + 2800 })
  })

  it('always deducts the basic health insurance, even above the Höchstbetrag', () => {
    const estimate = taxEstimateCrossBorder({ ...CROSS_BORDER, healthInsuranceEur: 4000 })

    if (estimate.kind !== 'spanne') throw new Error('expected a range')
    expect(estimate.provision).toEqual({ from: 9678 + 4000, to: 9678 + 4000 })
  })

  it('reduces income tax by § 35a household reduction (clamped at 0 €) and deducts § 33 extraordinary burden', () => {
    const base = taxEstimateEmployee(EMPLOYED)
    const withHousehold = taxEstimateEmployee({ ...EMPLOYED, householdReductionEur: 1200 })
    const zeroTaxClamped = taxEstimateEmployee({ ...EMPLOYED, householdReductionEur: 50000 })
    const withHealth = taxEstimateEmployee({
      ...EMPLOYED,
      healthExpensesEur: 4000,
      childrenBracket: '0',
    })
    const crossWithHealth = taxEstimateCrossBorder({
      ...CROSS_BORDER,
      householdReductionEur: 600,
      healthExpensesEur: 8000,
      childrenBracket: '1-2',
    })

    if (
      base.kind !== 'spanne' ||
      withHousehold.kind !== 'spanne' ||
      zeroTaxClamped.kind !== 'spanne' ||
      withHealth.kind !== 'spanne' ||
      crossWithHealth.kind !== 'spanne'
    ) {
      throw new Error('expected spans')
    }
    expect(withHousehold.incomeTax).toEqual({
      from: base.incomeTax.from - 1200,
      to: base.incomeTax.to - 1200,
    })
    expect(zeroTaxClamped.incomeTax).toEqual({ from: 0, to: 0 })
    expect(withHealth.taxableIncome.from).toBeLessThan(base.taxableIncome.from)
    const singleParentWithHealth = taxEstimateEmployee({
      ...EMPLOYED,
      healthExpensesEur: 4000,
      singleParent: true,
      childrenBracket: '1-2',
    })
    if (singleParentWithHealth.kind !== 'spanne') throw new Error('expected span')
    // Single-parent § 24b lowers GdE -> lower reasonable burden -> larger § 33 deduction -> lower zvE.
    expect(singleParentWithHealth.taxableIncome.from).toBeLessThan(withHealth.taxableIncome.from)
    expect(crossWithHealth.taxableIncome.from).toBeLessThan(
      (taxEstimateCrossBorder(CROSS_BORDER) as Extract<typeof base, { kind: 'spanne' }>).taxableIncome.from,
    )
  })
})
