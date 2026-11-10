import { describe, expect, it } from 'vitest'
import { AMOUNT_LATER } from '../interview/interview'
import {
  applyHouseholdTaxReduction,
  calculateHouseholdServicesReduction,
  householdServicesFromAnswers,
} from './household-services'

describe('household services & craftsmen (§ 35a EStG)', () => {
  it('applies § 35a Abs. 1 minijob 20 % up to 510 € (under / exact / over cap)', () => {
    expect(calculateHouseholdServicesReduction({ year: 2025, minijobEur: 2000 }).minijobReductionEur).toBe(400)
    expect(calculateHouseholdServicesReduction({ year: 2025, minijobEur: 2550 }).minijobReductionEur).toBe(510)
    expect(calculateHouseholdServicesReduction({ year: 2025, minijobEur: 4000 }).minijobReductionEur).toBe(510)
  })

  it('applies § 35a Abs. 2 services & care 20 % up to 4.000 € (under / exact / over cap)', () => {
    expect(calculateHouseholdServicesReduction({ year: 2025, servicesEur: 10000 }).servicesReductionEur).toBe(2000)
    expect(calculateHouseholdServicesReduction({ year: 2025, servicesEur: 20000 }).servicesReductionEur).toBe(4000)
    expect(calculateHouseholdServicesReduction({ year: 2025, servicesEur: 30000 }).servicesReductionEur).toBe(4000)
  })

  it('applies § 35a Abs. 3 craftsmen labour 20 % up to 1.200 € (under / exact / over cap)', () => {
    expect(calculateHouseholdServicesReduction({ year: 2025, craftsmenEur: 3000 }).craftsmenReductionEur).toBe(600)
    expect(calculateHouseholdServicesReduction({ year: 2025, craftsmenEur: 6000 }).craftsmenReductionEur).toBe(1200)
    expect(calculateHouseholdServicesReduction({ year: 2025, craftsmenEur: 9000 }).craftsmenReductionEur).toBe(1200)
  })

  it('computes exact cent values and sums across all three § 35a paragraphs', () => {
    const partial = calculateHouseholdServicesReduction({
      year: 2025,
      minijobEur: 1,
      servicesEur: 2,
      craftsmenEur: 1.03,
    })
    expect(partial.minijobReductionCents).toBe(20)
    expect(partial.servicesReductionCents).toBe(40)
    expect(partial.craftsmenReductionCents).toBe(21)
    expect(partial.totalReductionCents).toBe(81)
    expect(partial.totalReductionEur).toBe(0.81)

    const capped = calculateHouseholdServicesReduction({
      year: 2025,
      minijobEur: 5000,
      servicesEur: 25000,
      craftsmenEur: 8000,
    })
    expect(capped.totalReductionEur).toBe(510 + 4000 + 1200)
    expect(capped.totalReductionCents).toBe(571000)
  })

  it('never reduces tariff income tax below 0 €', () => {
    expect(applyHouseholdTaxReduction(3000, 1200)).toBe(1800)
    expect(applyHouseholdTaxReduction(800, 1200)).toBe(0)
    expect(applyHouseholdTaxReduction(0, 500)).toBe(0)
  })

  it('parses haushalt catalogue answers and treats AMOUNT_LATER or Nein safely as 0 €', () => {
    expect(householdServicesFromAnswers({ 'haushalt-gate': 'Nein' }, 2025).totalReductionEur).toBe(0)
    const later = householdServicesFromAnswers(
      {
        'haushalt-gate': 'Ja',
        'haushalt-dienstleistung-betrag': AMOUNT_LATER,
        'haushalt-handwerker-betrag': '1000',
        'haushalt-minijob-betrag': AMOUNT_LATER,
      },
      2025,
    )
    expect(later.totalReductionEur).toBe(200)
    expect(later.servicesReductionEur).toBe(0)
    expect(later.minijobReductionEur).toBe(0)
  })

  it('rejects negative inputs with RangeError', () => {
    expect(() => calculateHouseholdServicesReduction({ year: 2025, minijobEur: -1 })).toThrow(RangeError)
  })
})
