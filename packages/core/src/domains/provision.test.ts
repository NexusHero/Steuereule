import { describe, expect, it } from 'vitest'
import { deductibleProvision, type PersonProvision } from './provision'

const NOTHING: PersonProvision = {
  pensionOwnEur: 0,
  pensionEmployerEur: 0,
  healthBasicEur: 0,
  healthWithSickPayEur: 0,
  careEur: 0,
  employerSubsidyEur: 0,
  otherEur: 0,
  reducedOtherCap: false,
}

describe('deductibleProvision (§ 10 Abs. 3 und 4 EStG, ADR-0094)', () => {
  it('the notice for 2025: two Grenzgänger, basic insurance below the joint cap, so other provision fills it', () => {
    const a = { ...NOTHING, pensionOwnEur: 9589, pensionEmployerEur: 9589, healthBasicEur: 2252, otherEur: 1741, reducedOtherCap: true }
    const b = { ...NOTHING, pensionOwnEur: 9090, pensionEmployerEur: 9090, healthBasicEur: 2252, otherEur: 1608 }
    const d = deductibleProvision(2025, [a, b], { healthBasicEur: 0, careEur: 0, otherEur: 556 })
    expect(d).toMatchObject({
      pensionTotalEur: 37358,
      pensionEmployerEur: 18679,
      pensionEur: 18679,
      healthEur: 4504,
      careEur: 0,
      basicEur: 4504,
      otherEur: 3905,
      otherCapEur: 4700,
      healthCareOtherEur: 4700,
      totalEur: 23379,
    })
  })

  it('the notice for 2024: a German certificate with a subsidised voluntary insurance plus Swiss contributions', () => {
    const a = {
      ...NOTHING,
      pensionOwnEur: 7022 + 1539.86,
      pensionEmployerEur: 7021 + 1539.86,
      healthBasicEur: 8384 + 991,
      healthWithSickPayEur: 8384,
      careEur: 1760,
      employerSubsidyEur: 4191 + 879,
      employerCareSubsidyEur: 879,
      otherEur: 982 + 281,
      reducedOtherCap: true,
    }
    const b = { ...NOTHING, pensionOwnEur: 8360, pensionEmployerEur: 8360, healthBasicEur: 3965, otherEur: 1450 }
    const d = deductibleProvision(2024, [a, b], { healthBasicEur: 0, careEur: 0, otherEur: 266 })
    expect(d).toMatchObject({
      pensionTotalEur: 33843,
      pensionEmployerEur: 16921,
      pensionEur: 16922,
      healthEur: 13340,
      sickPayCutEur: 167,
      careEur: 1760,
      employerSubsidyEur: 5070,
      basicEur: 9863,
      // Basic insurance alone is above the cap: nothing else is deducted.
      healthCareOtherEur: 9863,
      totalEur: 26785,
    })
  })

  it('splits the subsidy like the contributions when the care part is not known', () => {
    const a = { ...NOTHING, healthBasicEur: 8384, healthWithSickPayEur: 8384, careEur: 1760, employerSubsidyEur: 5070, reducedOtherCap: true }
    expect(deductibleProvision(2024, [a]).sickPayCutEur).toBe(167)
  })

  it('caps the basic pension at the Höchstbetrag of the year, doubled for a couple', () => {
    const rich = { ...NOTHING, pensionOwnEur: 20000, pensionEmployerEur: 20000 }
    expect(deductibleProvision(2025, [rich]).pensionEur).toBe(29344 - 20000)
    expect(deductibleProvision(2025, [rich, NOTHING]).pensionEur).toBe(20000)
  })

  it('2022 deducts 94 % of the basic pension', () => {
    const p = { ...NOTHING, pensionOwnEur: 5000, pensionEmployerEur: 5000 }
    expect(deductibleProvision(2022, [p]).pensionEur).toBe(9400 - 5000)
  })

  it('other provision counts up to 1.900 € for an employee with a subsidy and 2.800 € without', () => {
    expect(deductibleProvision(2025, [{ ...NOTHING, otherEur: 5000, reducedOtherCap: true }]).healthCareOtherEur).toBe(1900)
    expect(deductibleProvision(2025, [{ ...NOTHING, otherEur: 5000 }]).healthCareOtherEur).toBe(2800)
    expect(deductibleProvision(2025, [{ ...NOTHING, healthBasicEur: 1000, otherEur: 500 }]).healthCareOtherEur).toBe(1500)
  })
})
