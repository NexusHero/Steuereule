import { describe, expect, it } from 'vitest'
import {
  burdenChildrenBracket,
  calculateExtraordinaryBurden,
  extraordinaryBurdenFromAnswers,
} from './extraordinary-burdens'

describe('extraordinary burdens / medical costs (§ 33 Abs. 3 EStG, BFH VI R 75/14)', () => {
  it('matches the mandatory staged reference case: GdE 51.835 €, 2 children -> 1.408,70 €', () => {
    const res = calculateExtraordinaryBurden({
      year: 2025,
      gdeEur: 51835,
      expensesEur: 2000,
      filing: 'einzel',
      childrenCount: 2,
    })
    expect(res.reasonableBurdenCents).toBe(140870)
    expect(res.reasonableBurdenEur).toBe(1408.7)
    expect(res.deductibleEur).toBe(591.3)
  })

  describe('covers all 12 cells of the § 33 Abs. 3 table accurately', () => {
    it.each([
      // single, no children: 5 % / 6 % / 7 %
      { filing: 'einzel' as const, childrenCount: 0, gdeEur: 10000, expectedBurden: 500 },
      { filing: 'einzel' as const, childrenCount: 0, gdeEur: 30000, expectedBurden: 1646.6 },
      { filing: 'einzel' as const, childrenCount: 0, gdeEur: 60000, expectedBurden: 3535.3 },
      // joint, no children: 4 % / 5 % / 6 %
      { filing: 'zusammen' as const, childrenCount: 0, gdeEur: 10000, expectedBurden: 400 },
      { filing: 'zusammen' as const, childrenCount: 0, gdeEur: 30000, expectedBurden: 1346.6 },
      { filing: 'zusammen' as const, childrenCount: 0, gdeEur: 60000, expectedBurden: 2935.3 },
      // 1 or 2 children: 2 % / 3 % / 4 %
      { filing: 'einzel' as const, childrenCount: 1, gdeEur: 10000, expectedBurden: 200 },
      { filing: 'einzel' as const, childrenCount: 2, gdeEur: 30000, expectedBurden: 746.6 },
      { filing: 'zusammen' as const, childrenCount: 2, gdeEur: 60000, expectedBurden: 1735.3 },
      // 3 or more children: 1 % / 1 % / 2 %
      { filing: 'zusammen' as const, childrenCount: 3, gdeEur: 10000, expectedBurden: 100 },
      { filing: 'einzel' as const, childrenCount: 3, gdeEur: 30000, expectedBurden: 300 },
      { filing: 'zusammen' as const, childrenCount: 4, gdeEur: 60000, expectedBurden: 688.7 },
    ])('$filing children=$childrenCount gde=$gdeEur -> $expectedBurden €', ({ filing, childrenCount, gdeEur, expectedBurden }) => {
      const res = calculateExtraordinaryBurden({
        year: 2025,
        gdeEur,
        expensesEur: 10000,
        filing,
        childrenCount,
      })
      expect(res.reasonableBurdenEur).toBe(expectedBurden)
      expect(res.deductibleEur).toBe(Math.round((10000 - expectedBurden) * 100) / 100)
    })
  })

  it('caps deductible amount at 0 when expenses are below the reasonable burden', () => {
    const res = calculateExtraordinaryBurden({
      year: 2025,
      gdeEur: 40000,
      expensesEur: 500,
      filing: 'einzel',
      childrenCount: 0,
    })
    expect(res.deductibleEur).toBe(0)
    expect(res.deductibleCents).toBe(0)
  })

  it('maps interview answer kinder onto § 33 brackets (2 oder mehr -> 1-2 per PO ruling)', () => {
    expect(burdenChildrenBracket(undefined)).toBe('0')
    expect(burdenChildrenBracket('Nein')).toBe('0')
    expect(burdenChildrenBracket('1 Kind')).toBe('1-2')
    expect(burdenChildrenBracket('2 oder mehr')).toBe('1-2')
  })

  it('extracts health expenses from catalogue answers safely', () => {
    expect(extraordinaryBurdenFromAnswers({ 'gesundheit-gate': 'Nein' })).toBe(0)
    expect(extraordinaryBurdenFromAnswers({ 'gesundheit-gate': 'Ja', 'gesundheit-betrag': '1850' })).toBe(1850)
  })
})
