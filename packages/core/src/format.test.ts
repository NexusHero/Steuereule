import { describe, it, expect } from 'vitest'
import { formatZahl, formatEuro, formatEuroCent } from './format'

// NBSP that must sit between number and unit (design-system rule 10, qa-checkliste).
const NBSP = ' '

describe('formatZahl', () => {
  it('thousands_grouped_with_de_separator', () => {
    // Arrange / Act / Assert — golden value from demo-daten.js.
    expect(formatZahl(1407)).toBe('1.407')
  })

  it('below_thousand_unchanged', () => {
    expect(formatZahl(60)).toBe('60')
  })

  it('zero_is_zero', () => {
    expect(formatZahl(0)).toBe('0')
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatZahl(Number.NaN)).toThrow(RangeError)
    expect(() => formatZahl(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('formatEuro', () => {
  it('whole_euro_has_nbsp_before_sign', () => {
    expect(formatEuro(1407)).toBe(`1.407${NBSP}€`)
  })

  it('separator_is_not_a_plain_space', () => {
    // Guard the exact separator: a plain space would let the pill wrap at 375px.
    expect(formatEuro(1407)).not.toBe('1.407 €')
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatEuro(Number.NaN)).toThrow(RangeError)
  })
})

describe('formatEuroCent', () => {
  it('two_decimals_with_nbsp', () => {
    expect(formatEuroCent(1444)).toBe(`1.444,00${NBSP}€`)
  })

  it('rounds_to_two_decimals', () => {
    expect(formatEuroCent(1444.567)).toBe(`1.444,57${NBSP}€`)
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatEuroCent(Number.NEGATIVE_INFINITY)).toThrow(RangeError)
  })
})
