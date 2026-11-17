import { describe, expect, it } from 'vitest'
import { estimateMarriedCouple, type MarriedEstimateInput } from './married-estimate'
import type { PersonProvision } from '../domains/provision'

// Two real income tax notices of one couple, rebuilt from the filed returns (ADR-0094). Only the
// amounts are real; nothing here names a person, an employer or a tax number. The expectation is the
// notice to the euro (the Solidaritätszuschlag to the cent).

const NO_PROVISION: PersonProvision = {
  pensionOwnEur: 0,
  pensionEmployerEur: 0,
  healthBasicEur: 0,
  healthWithSickPayEur: 0,
  careEur: 0,
  employerSubsidyEur: 0,
  otherEur: 0,
  reducedOtherCap: false,
}

function assessed(input: MarriedEstimateInput) {
  const result = estimateMarriedCouple(input)
  if (result.kind !== 'spanne') throw new Error('expected an estimate')
  return result
}

describe('notice parity: a couple of Grenzgänger with one child', () => {
  it('2025: both work in Switzerland all year', () => {
    const r = assessed({
      year: 2025,
      a: {
        kind: 'crossBorder',
        wageEur: 134436,
        swissWithholdingEur: 5800,
        pensionContributionsEur: 9589,
        otherProvisionEur: 1741,
        // 226 days × 67 km = 5.393 €, work equipment 110 €, account fees 32 €.
        commuteAllowance: 5393 + 110 + 32,
        selfPaidHealthCare: 2252,
        provision: { ...NO_PROVISION, pensionOwnEur: 9589, pensionEmployerEur: 9589, healthBasicEur: 2252, otherEur: 1741, reducedOtherCap: true },
      },
      b: {
        kind: 'crossBorder',
        wageEur: 131218,
        swissWithholdingEur: 5541,
        pensionContributionsEur: 9090,
        otherProvisionEur: 1608,
        commuteAllowance: 1700 + 110 + 32,
        selfPaidHealthCare: 2252,
        provision: { ...NO_PROVISION, pensionOwnEur: 9090, pensionEmployerEur: 9090, healthBasicEur: 2252, otherEur: 1608 },
      },
      children: 1,
      childBenefit: 3060,
      rentalSurplus: 0,
      // Donations 3.135 € and 80 % of 591 € childcare.
      donations: 3135 + 473,
      householdReductionEur: 70,
      healthExpensesEur: 390,
      childrenProvision: { healthBasicEur: 0, careEur: 0, otherEur: 556 },
      capitalIncomeEur: 449,
    })
    expect(r.werbungskosten).toBe(5535 + 1842)
    expect(r.provision).toEqual({ from: 23379, to: 23379 })
    expect(r.specialExpenses).toBe(3608)
    expect(r.childAllowanceUsed).toBe(true)
    expect(r.taxableIncome).toEqual({ from: 221690, to: 221690 })
    expect(r.incomeTax).toEqual({ from: 74386, to: 74386 })
    expect(r.solidaritaetszuschlag).toEqual({ from: 3732.52, to: 3732.52 })
    expect(r.anrechnung).toBe(11341)
    expect(r.result).toEqual({ from: -66777.52, to: -66777.52 })
  })

  it('2024: one spouse changes from a German to a Swiss employer in November', () => {
    const r = assessed({
      year: 2024,
      a: {
        kind: 'mixed',
        grossWage: 78564 + 1082,
        wageTax: 19125,
        soliWithheldEur: 190.46,
        socialSecurity: 0,
        wageEur: 21708,
        swissWithholdingEur: 937,
        pensionContributionsEur: 0,
        otherProvisionEur: 0,
        // 38 days × 67 km = 907 €, plus 110 € and 32 €: below the Arbeitnehmer-Pauschbetrag.
        commuteAllowance: 907 + 110 + 32,
        selfPaidHealthCare: 0,
        provision: {
          ...NO_PROVISION,
          pensionOwnEur: 7022 + 1539.86,
          pensionEmployerEur: 7021 + 1539.86,
          healthBasicEur: 8384 + 991,
          healthWithSickPayEur: 8384,
          careEur: 1760,
          employerSubsidyEur: 4191 + 879,
          employerCareSubsidyEur: 879,
          otherEur: 982 + 281,
          reducedOtherCap: true,
        },
      },
      b: {
        kind: 'crossBorder',
        wageEur: 117012,
        swissWithholdingEur: 4832,
        pensionContributionsEur: 0,
        otherProvisionEur: 0,
        commuteAllowance: 1905 + 110 + 32,
        selfPaidHealthCare: 0,
        provision: { ...NO_PROVISION, pensionOwnEur: 8360, pensionEmployerEur: 8360, healthBasicEur: 3965, otherEur: 1450 },
      },
      children: 1,
      childBenefit: 3000,
      rentalSurplus: 0,
      // Donations 3.498 € and two thirds of 616 € childcare.
      donations: 3498 + 411,
      householdReductionEur: 1200,
      childrenProvision: { healthBasicEur: 0, careEur: 0, otherEur: 266 },
      capitalIncomeEur: 682,
    })
    expect(r.werbungskosten).toBe(1230 + 2047)
    expect(r.provision).toEqual({ from: 26785, to: 26785 })
    expect(r.taxableIncome).toEqual({ from: 174855, to: 174855 })
    expect(r.incomeTax).toEqual({ from: 54136, to: 54136 })
    expect(r.solidaritaetszuschlag).toEqual({ from: 1759.36, to: 1759.36 })
    expect(r.anrechnung).toBe(19125 + 190.46 + 5769)
    expect(r.result).toEqual({ from: -30810.9, to: -30810.9 })
  })
})
