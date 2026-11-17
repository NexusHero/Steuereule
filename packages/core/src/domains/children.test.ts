import { describe, expect, it } from 'vitest'
import {
  calculateDifferentialChildBenefit,
  isValidChildBirthDate,
  childTaxAllowance,
  childBenefitForComparison,
  monthlyChildBenefitClaim,
  calculateChildrenStatus,
  type ChildData,
} from './children'

describe('kinder', () => {
  it('validates child birthdate (not in the future, valid calendar date)', () => {
    expect(isValidChildBirthDate('2018-05-14', 2025)).toBe(true)
    expect(isValidChildBirthDate('2026-01-01', 2025)).toBe(false)
    expect(isValidChildBirthDate('invalid', 2025)).toBe(false)
  })

  it('statutory Kinderfreibetrag + BEA (§ 32 Abs. 6 EStG), both parents together', () => {
    // 2022: 5.620 + 2.928 = 8.548
    expect(childTaxAllowance(2022)).toBe(5620 + 2928)
    // 2023: 6.024 + 2.928 = 8.952
    expect(childTaxAllowance(2023)).toBe(6024 + 2928)
    // 2024 after the retroactive raise: 6.612 + 2.928
    expect(childTaxAllowance(2024)).toBe(9540)
    expect(childTaxAllowance(2025)).toBe(6672 + 2928)
    expect(childTaxAllowance(2026)).toBe(6828 + 2928)
  })

  it('monthly Kindergeld (§ 66 EStG): 219 € in 2022, 250 € through 2024, 255 € in 2025, 259 € from 2026', () => {
    expect(monthlyChildBenefitClaim(2022)).toBe(219)
    expect(monthlyChildBenefitClaim(2023)).toBe(250)
    expect(monthlyChildBenefitClaim(2024)).toBe(250)
    expect(monthlyChildBenefitClaim(2025)).toBe(255)
    expect(monthlyChildBenefitClaim(2026)).toBe(259)
  })

  it('a child born in the year counts from its birth month (§ 32 Abs. 6 Satz 5, § 66 Abs. 2 EStG)', () => {
    const newborn: ChildData = { id: 'k', firstName: 'Ida', lastName: 'M', birthDate: '2025-10-20', taxId: null, childBenefit: null }
    const status = calculateChildrenStatus([newborn], 2025)
    expect(status.childBenefitSum).toBe(3 * 255)
    expect(status.totalAllowance).toBe(Math.round((9600 * 3) / 12))
  })

  it('folds child facts into deterministic count and figures', () => {
    const kinder: ChildData[] = [
      {
        id: 'k-1',
        firstName: 'Mia',
        lastName: 'Muster',
        birthDate: '2019-04-12',
        taxId: '12345678901',
        childBenefit: 3000,
      },
      {
        id: 'k-2',
        firstName: 'Ben',
        lastName: 'Muster',
        birthDate: '2022-09-01',
        taxId: null,
        childBenefit: 3000,
      },
    ]
    const status = calculateChildrenStatus(kinder, 2025)
    expect(status.count).toBe(2)
    expect(status.childBenefitSum).toBe(6000)
    expect(status.totalAllowance).toBe(2 * 9600)
  })

  it('calculates Differenzkindergeld for Swiss family allowances (ADR-0054, #414)', () => {
    // 2025: 255 €/month = 3.060 €/year
    // Markus Brenner case: 2.580 CHF * 1.065 = 2.748 € Swiss allowance -> 312 € difference
    const result = calculateDifferentialChildBenefit('2016-03-14', 2025, 2748)
    expect(result.statutoryClaim).toBe(3060)
    expect(result.swissAllowanceEur).toBe(2748)
    expect(result.differentialChildBenefit).toBe(312)
    expect(result.totalClaim).toBe(3060)

    // Swiss allowance higher than German Kindergeld: difference is 0, total claim is higher Swiss amount
    const higher = calculateDifferentialChildBenefit('2019-09-02', 2025, 3500)
    expect(higher.statutoryClaim).toBe(3060)
    expect(higher.differentialChildBenefit).toBe(0)
    expect(higher.totalClaim).toBe(3500)

    // Child born in October (3 months claim): 3 * 255 = 765 €, Swiss allowance 600 € -> difference 165 €
    const newborn = calculateDifferentialChildBenefit('2025-10-15', 2025, 600)
    expect(newborn.statutoryClaim).toBe(765)
    expect(newborn.differentialChildBenefit).toBe(165)
    expect(newborn.totalClaim).toBe(765)

    expect(() => calculateDifferentialChildBenefit('2020-01-01', 2025, -10)).toThrow(RangeError)
  })

  it('integrates Swiss family allowances and Differenzkindergeld into KinderStand (ADR-0054, #414)', () => {
    // Scenario 2: Markus Brenner (Mia born 2016, Noah born 2019, 2.748 € Swiss allowance each)
    const kinder: ChildData[] = [
      {
        id: 'mia',
        firstName: 'Mia',
        lastName: 'Brenner',
        birthDate: '2016-03-14',
        taxId: '41234567890',
        childBenefit: null,
        swissFamilyAllowanceEur: 2748,
      },
      {
        id: 'noah',
        firstName: 'Noah',
        lastName: 'Brenner',
        birthDate: '2019-09-02',
        taxId: '41234567891',
        childBenefit: null,
        swissFamilyAllowanceEur: 2748,
      },
    ]
    const status = calculateChildrenStatus(kinder, 2025)
    expect(status.count).toBe(2)
    expect(status.swissFamilyAllowanceSum).toBe(2748 * 2) // 5.496 €
    expect(status.differentialChildBenefitSum).toBe(312 * 2) // 624 €
    expect(status.childBenefitSum).toBe(3060 * 2) // 6.120 € total claim for Günstigerprüfung
    expect(status.totalAllowance).toBe(9600 * 2) // 19.200 € Kinderfreibetrag + BEA
  })

  it('the Günstigerprüfung counts the claim to German Kindergeld, whatever was paid and by whom (§ 31 Satz 4–6, § 65 EStG)', () => {
    // 2025: 12 × 255 € = 3.060 €. A Swiss Kinderzulage of 2.400 € plus 660 € Differenzkindergeld is that same claim.
    const lower = calculateDifferentialChildBenefit('2021-03-09', 2025, 2400)
    expect(lower.swissAllowanceEur + lower.differentialChildBenefit).toBe(3060)
    expect(childBenefitForComparison('2021-03-09', 2025)).toBe(3060)

    // Only the Differenzkindergeld reached the account (660 €): the comparison still uses the claim.
    const paidOnlyTopUp: ChildData = { id: 'k', firstName: 'Mila', lastName: 'Muster', birthDate: '2021-03-09', taxId: null, childBenefit: 660, swissFamilyAllowanceEur: 2400 }
    expect(calculateChildrenStatus([paidOnlyTopUp], 2025).childBenefitSum).toBe(660) // what the mask shows as entered
    expect(childBenefitForComparison(paidOnlyTopUp.birthDate, 2025)).toBe(3060)

    // A Swiss allowance above the German Kindergeld is offset only up to the German amount.
    expect(calculateDifferentialChildBenefit('2021-03-09', 2025, 3500).differentialChildBenefit).toBe(0)
    expect(childBenefitForComparison('2021-03-09', 2025)).toBe(3060)

    // By month: born in October 2025 → 3 months; 2024 → 12 × 250 €.
    expect(childBenefitForComparison('2025-10-15', 2025)).toBe(765)
    expect(childBenefitForComparison('2021-03-09', 2024)).toBe(3000)
  })
})
