import { describe, it, expect } from 'vitest'
import { formatNumber, formatEuro, formatEuroCents } from './format'

// NBSP that must sit between number and unit (design-system rule 10, qa-checkliste).
const NBSP = '\u00A0'

describe('formatNumber', () => {
  it('thousands_grouped_with_de_separator', () => {
    // Arrange / Act / Assert — golden value from demo-daten.js.
    expect(formatNumber(1407)).toBe('1.407')
  })

  it('below_thousand_unchanged', () => {
    expect(formatNumber(60)).toBe('60')
  })

  it('zero_is_zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError)
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError)
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

describe('formatEuroCents', () => {
  it('two_decimals_with_nbsp', () => {
    expect(formatEuroCents(1444)).toBe(`1.444,00${NBSP}€`)
  })

  it('rounds_to_two_decimals', () => {
    expect(formatEuroCents(1444.567)).toBe(`1.444,57${NBSP}€`)
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatEuroCents(Number.NEGATIVE_INFINITY)).toThrow(RangeError)
  })
})
