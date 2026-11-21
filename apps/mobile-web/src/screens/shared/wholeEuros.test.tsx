import { describe, expect, it } from 'vitest'
import { signedWholeAmountFrom, wholeEurosFrom } from './wholeEuros'

// The LStB prints euros with cents; the form takes whole euros. Typing the printed amount must not be lost.
describe('wholeEurosFrom', () => {
  it.each([
    ['5072', 5072],
    ['7021,48', 7021],
    ['4191,80', 4192],
    ['18.145,99', 18146],
    ['78.565', 78565],
    ['7021.48', 7021],
    ['0,49', 0],
    [' 981,51 ', 982],
  ])('reads %j as %d', (text, value) => {
    expect(wholeEurosFrom(text)).toBe(value)
  })

  it.each(['', '   ', '-3', 'abc', '12,345', '1.2.3', '007'])('treats %j as not entered', (text) => {
    expect(wholeEurosFrom(text)).toBeNull()
  })

  // Swiss documents group thousands with an apostrophe or a space and print rappen.
  it.each([
    ["948,60", 949],
    ["2'892.00", 2892],
    ["3’592.80", 3593],
    ['20 843', 20843],
    ['2938,17', 2938],
    ['2747.70', 2748],
  ])('rounds %j to %d', (text, value) => {
    expect(wholeEurosFrom(text)).toBe(value)
  })

  it('reads a signed amount where a field allows one, and rounds its magnitude', () => {
    expect(signedWholeAmountFrom('-118')).toBe(-118)
    expect(signedWholeAmountFrom('\u2212118,40')).toBe(-118)
    expect(signedWholeAmountFrom('4633,52')).toBe(4634)
    expect(signedWholeAmountFrom('abc')).toBeNull()
  })
})
