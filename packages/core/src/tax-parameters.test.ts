import { describe, expect, it } from 'vitest'
import { getTaxYearParameters, taxParameters } from './tax-parameters'

describe('TaxYearParameters (Temporal Parameter Registry)', () => {
  it('provides the official § 32a EStG Grundfreibetrag per supported year', () => {
    expect(getTaxYearParameters(2024).basicAllowance).toBe(11784)
    expect(getTaxYearParameters(2025).basicAllowance).toBe(12096)
    expect(getTaxYearParameters(2026).basicAllowance).toBe(12348)
  })

  it('provides statutory lump sums (Pauschbeträge)', () => {
    for (const year of [2024, 2025, 2026] as const) {
      const p = getTaxYearParameters(year)
      // § 9a Satz 1 Nr. 1 Buchst. a EStG: Arbeitnehmer-Pauschbetrag
      expect(p.lumpSums.employee).toBe(1230)
      // § 10c EStG: Sonderausgaben-Pauschbetrag
      expect(p.lumpSums.specialExpensesSingle).toBe(36)
      expect(p.lumpSums.specialExpensesJoint).toBe(72)
      // § 20 Abs. 9 EStG: Sparer-Pauschbetrag
      expect(p.lumpSums.saverSingle).toBe(1000)
      expect(p.lumpSums.saverJoint).toBe(2000)
      // § 10 Abs. 4 EStG: Höchstbetrag sonstige Vorsorgeaufwendungen
      expect(p.maxOtherProvisionEur).toBe(2800)
    }
  })

  it('provides statutory commute distance rates and home office allowances', () => {
    const p2024 = getTaxYearParameters(2024)
    expect(p2024.commute).toEqual({ firstKmThreshold: 20, rateFirstEur: 0.3, rateAdditionalEur: 0.38, maxWithoutCarEur: 4500 })
    expect(p2024.homeOffice).toEqual({ dailyRateEur: 6, maxDays: 210, maxAnnualEur: 1260 })

    const p2025 = getTaxYearParameters(2025)
    expect(p2025.commute).toEqual({ firstKmThreshold: 20, rateFirstEur: 0.3, rateAdditionalEur: 0.38, maxWithoutCarEur: 4500 })

    const p2026 = getTaxYearParameters(2026)
    expect(p2026.commute).toEqual({ firstKmThreshold: 0, rateFirstEur: 0.38, rateAdditionalEur: 0.38, maxWithoutCarEur: 4500 })
  })

  it('provides statutory AO filing deadlines, capital tax and provision parameters', () => {
    const p2024 = getTaxYearParameters(2024)
    expect(p2024.deadlines.standardFilingDeadline).toBe('2025-07-31')
    expect(p2024.deadlines.warningThresholdDays).toBe(60)
    expect(p2024.deadlines.lateFilingMinEur).toBe(25)
    expect(p2024.deadlines.lateFilingPercentPerMonth).toBe(0.25)
    expect(p2024.capital.flatRateTaxRate).toBe(0.25)
    expect(p2024.capital.churchTaxReductionShare).toBe(0.25)
    expect(p2024.provision.sickPayReductionRate).toBe(0.04)

    const p2025 = getTaxYearParameters(2025)
    expect(p2025.deadlines.standardFilingDeadline).toBe('2026-07-31')

    const p2026 = getTaxYearParameters(2026)
    expect(p2026.deadlines.standardFilingDeadline).toBe('2027-07-31')
  })

  it('provides year-specific Kindergeld and Freibeträge', () => {
    // 2024: 250 € / Monat (3.000 € / Jahr)
    const p2024 = getTaxYearParameters(2024)
    expect(p2024.children.monthlyBenefitEur).toBe(250)
    expect(p2024.children.annualBenefitEur).toBe(3000)
    expect(p2024.children.singleParentReliefEur).toBe(4260)

    // 2025: 255 € / Monat (3.060 € / Jahr)
    const p2025 = getTaxYearParameters(2025)
    expect(p2025.children.monthlyBenefitEur).toBe(255)
    expect(p2025.children.annualBenefitEur).toBe(3060)
    expect(p2025.children.childAllowanceTotalEur).toBe(6672 + 2928)

    // 2026: 259 € / Monat
    const p2026 = getTaxYearParameters(2026)
    expect(p2026.children.monthlyBenefitEur).toBe(259)
    expect(p2026.children.annualBenefitEur).toBe(259 * 12)
    expect(p2026.children.childAllowanceTotalEur).toBe(6828 + 2928)
  })

  it('throws RangeError for unsupported tax years', () => {
    expect(() => getTaxYearParameters(2019)).toThrow(/Unsupported tax year/)
    expect(() => getTaxYearParameters(2030)).toThrow(/Unsupported tax year/)
  })

  it('taxParameters alias returns identical parameters', () => {
    expect(taxParameters(2025)).toEqual(getTaxYearParameters(2025))
  })
})
