import { describe, expect, it } from 'vitest'
import { parseGermanAmount, parseGermanCents, parseSignedGermanAmount } from './germanNumber'

describe('parseGermanAmount (WEB-46, WEB-13)', () => {
  it.each([
    ['40.000', 40_000],
    ['40.000,50', 40_000.5],
    ['40000', 40_000],
    ['40000,5', 40_000.5],
    ['1.234.567,89', 1_234_567.89],
    ['7021.48', 7021.48],
    ["2'892.00", 2892],
    ['20 843', 20_843],
    ['0,49', 0.49],
    [' 981,51 ', 981.51],
  ])('reads %j as %d', (text, value) => {
    expect(parseGermanAmount(text)).toBe(value)
  })

  it.each(['', '  ', 'abc', '12,345', '1.2.3', '007', '-3', '40.00.0'])('refuses %j instead of guessing', (text) => {
    expect(parseGermanAmount(text)).toBeNull()
  })

  it('gives exact cents without a floating-point step', () => {
    expect(parseGermanCents('40.000,50')).toBe(4_000_050)
    expect(parseGermanCents('0,1')).toBe(10)
    expect(parseGermanCents('1.005')).toBe(100_500)
  })

  it('reads a signed amount', () => {
    expect(parseSignedGermanAmount('−1.200,40')).toBe(-1200.4)
    expect(parseSignedGermanAmount('-0')).toBe(0)
  })
})
