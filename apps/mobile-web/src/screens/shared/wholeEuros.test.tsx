import { describe, expect, it } from 'vitest'
import { wholeEurosFrom } from './wholeEuros'

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
})
