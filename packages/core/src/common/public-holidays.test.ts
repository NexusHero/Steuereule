import { describe, expect, it } from 'vitest'
import { easterSunday, effectivePublicHolidays, holidaysOnWorkdays, publicHolidays } from './public-holidays'

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

describe('the holidays to subtract from the commute days', () => {
  const week = [1, 2, 3, 4, 5] as const
  it('takes a confirmed count first, then the region, else none', () => {
    expect(effectivePublicHolidays(2025, { workdays: week, publicHolidays: 9, publicHolidayRegion: 'BW' })).toBe(9)
    // Scenario Lena (fixture): 261 weekdays − 11 BW holidays − 34 days off = 216 commute days.
    expect(effectivePublicHolidays(2025, { workdays: week, publicHolidays: null, publicHolidayRegion: 'BW' })).toBe(11)
    expect(effectivePublicHolidays(2025, { workdays: week, publicHolidayRegion: null })).toBe(0)
    expect(effectivePublicHolidays(2025, { workdays: week, publicHolidayRegion: 'XX' })).toBe(0)
  })
})
