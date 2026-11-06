import { describe, expect, it } from 'vitest'
import { integerFrom } from './integer'

describe('ganzzahlAus', () => {
  it.each([
    ['45000', 45000],
    [' 120 ', 120],
    ['0', 0],
  ])('reads %j as %d', (text, value) => {
    expect(integerFrom(text)).toBe(value)
  })

  it.each(['', '   ', '12.5', '-3', '007', 'abc'])('treats %j as not entered', (text) => {
    expect(integerFrom(text)).toBeNull()
  })
})
