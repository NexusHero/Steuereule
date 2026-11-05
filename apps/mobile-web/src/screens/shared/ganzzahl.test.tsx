import { describe, expect, it } from 'vitest'
import { ganzzahlAus } from './ganzzahl'

describe('ganzzahlAus', () => {
  it.each([
    ['45000', 45000],
    [' 120 ', 120],
    ['0', 0],
  ])('reads %j as %d', (text, wert) => {
    expect(ganzzahlAus(text)).toBe(wert)
  })

  it.each(['', '   ', '12.5', '-3', '007', 'abc'])('treats %j as not entered', (text) => {
    expect(ganzzahlAus(text)).toBeNull()
  })
})
