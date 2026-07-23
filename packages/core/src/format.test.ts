import { describe, it, expect } from 'vitest'
import { formatNumber, formatEuro, formatEuroCents, formatEuroRange } from './format'

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

describe('formatEuroRange', () => {
  it('groups_both_bounds_with_one_trailing_unit', () => {
    // Golden value from the Cockpit hero card (REQ-001) — one € for the whole pair, not two.
    expect(formatEuroRange(1227, 1587)).toBe(`1.227–1.587${NBSP}€`)
  })

  it('collapses_to_a_single_value_when_from_equals_to', () => {
    // ADR-015: a settled estimate (isPointValue) reads as a plain amount, not "N–N €".
    expect(formatEuroRange(1407, 1407)).toBe(`1.407${NBSP}€`)
  })

  it('zero_to_zero_is_a_point_value', () => {
    expect(formatEuroRange(0, 0)).toBe(`0${NBSP}€`)
  })

  it('separator_is_an_en_dash_not_a_hyphen', () => {
    expect(formatEuroRange(1227, 1587)).toContain('–')
    expect(formatEuroRange(1227, 1587)).not.toContain('1.227-1.587')
  })

  it('throws_range_error_when_from_exceeds_to', () => {
    expect(() => formatEuroRange(1600, 1200)).toThrow(RangeError)
  })

  it('nonfinite_throws_range_error', () => {
    expect(() => formatEuroRange(Number.NaN, 100)).toThrow(RangeError)
    expect(() => formatEuroRange(100, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
