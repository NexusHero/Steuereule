import { describe, expect, it } from 'vitest'
import { easterSunday, holidaysOnWorkdays, publicHolidays } from './public-holidays'

const MO_FR = [1, 2, 3, 4, 5] as const

describe('publicHolidays', () => {
  it('finds Easter Sunday', () => {
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20')
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05')
  })

  it('Baden-Württemberg 2025: the twelve statutory holidays, Fronleichnam and Allerheiligen included', () => {
    expect(publicHolidays(2025, 'BW')).toEqual([
      '2025-01-01', '2025-01-06', '2025-04-18', '2025-04-21', '2025-05-01', '2025-05-29',
      '2025-06-09', '2025-06-19', '2025-10-03', '2025-11-01', '2025-12-25', '2025-12-26',
    ])
  })

  it('counts only the holidays that fall on working days (2025: Allerheiligen is a Saturday)', () => {
    expect(holidaysOnWorkdays(2025, 'BW', MO_FR)).toBe(11)
    expect(holidaysOnWorkdays(2025, 'BE', MO_FR)).toBe(9)
  })

  it('Basel-Stadt 2025 for a Grenzgänger: Bundesfeier and Stephanstag, no Fronleichnam', () => {
    const bs = publicHolidays(2025, 'BS')
    expect(bs).toContain('2025-08-01')
    expect(bs).toContain('2025-12-26')
    expect(bs).not.toContain('2025-06-19')
    expect(holidaysOnWorkdays(2025, 'BS', MO_FR)).toBe(9)
  })
})
