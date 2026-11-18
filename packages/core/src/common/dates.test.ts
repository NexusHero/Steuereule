import { describe, expect, it } from 'vitest'
import {
  GERMAN_DATE_PATTERN,
  ISO_DATE_PATTERN,
  ageAtEndOfYear,
  isGermanDate,
  isIsoDate,
  parseDate,
  toGermanDate,
  toIsoDate,
  todayIso,
} from './dates'

describe('parseDate', () => {
  it('reads an ISO date', () => {
    expect(parseDate('2026-01-31')).toEqual({ year: 2026, month: 1, day: 31 })
  })

  it('reads a German date with and without leading zeros', () => {
    expect(parseDate('31.01.2026')).toEqual({ year: 2026, month: 1, day: 31 })
    expect(parseDate('1.2.2026')).toEqual({ year: 2026, month: 2, day: 1 })
  })

  it('ignores surrounding whitespace', () => {
    expect(parseDate(' 2026-01-31 ')).toEqual({ year: 2026, month: 1, day: 31 })
    expect(parseDate(' 14.06.2010\n')).toEqual({ year: 2010, month: 6, day: 14 })
  })

  it('rejects a date that does not exist', () => {
    expect(parseDate('2026-02-29')).toBeNull()
    expect(parseDate('31.04.2026')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('00.01.2026')).toBeNull()
  })

  it('accepts 29 February in a leap year', () => {
    expect(parseDate('29.02.2024')).toEqual({ year: 2024, month: 2, day: 29 })
  })

  it('rejects anything else', () => {
    for (const text of ['', '2026', '2026-1-31', '31.01.26', '31/01/2026', '2026-01-31T00:00:00Z', 'gestern', '111.01.2026']) {
      expect(parseDate(text)).toBeNull()
    }
  })
})

describe('toIsoDate / toGermanDate', () => {
  it('turns either form into ISO', () => {
    expect(toIsoDate('1.2.2026')).toBe('2026-02-01')
    expect(toIsoDate('2026-02-01')).toBe('2026-02-01')
    expect(toIsoDate('30.02.2026')).toBeNull()
  })

  it('turns either form into German with two-digit day and month', () => {
    expect(toGermanDate('2026-01-31')).toBe('31.01.2026')
    expect(toGermanDate('1.2.2026')).toBe('01.02.2026')
    expect(toGermanDate('2026-02-30')).toBeNull()
  })

  it('formats a parsed date', () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07')
    expect(toGermanDate({ year: 2026, month: 3, day: 7 })).toBe('07.03.2026')
  })
})

describe('isIsoDate / isGermanDate', () => {
  it('checks the form and that the date exists', () => {
    expect(isIsoDate('2026-01-31')).toBe(true)
    expect(isIsoDate('2026-02-31')).toBe(false)
    expect(isIsoDate('31.01.2026')).toBe(false)
    expect(isGermanDate('31.01.2026')).toBe(true)
    expect(isGermanDate('1.2.2026')).toBe(true)
    expect(isGermanDate('31.02.2026')).toBe(false)
    expect(isGermanDate('2026-01-31')).toBe(false)
  })
})

describe('patterns', () => {
  it('keeps the exact regex sources the DTOs and the tool schemas were written with', () => {
    expect(ISO_DATE_PATTERN.source).toBe(String.raw`^\d{4}-\d{2}-\d{2}$`)
    expect(GERMAN_DATE_PATTERN.source).toBe(String.raw`^\d{2}\.\d{2}\.\d{4}$`)
    expect(ISO_DATE_PATTERN.flags).toBe('')
    expect(GERMAN_DATE_PATTERN.flags).toBe('')
  })
})

describe('ageAtEndOfYear', () => {
  it('counts the age in whole calendar years from ISO and German dates', () => {
    expect(ageAtEndOfYear('2010-06-14', 2025)).toBe(15)
    expect(ageAtEndOfYear('14.06.2010', 2025)).toBe(15)
    expect(ageAtEndOfYear('2025-12-31', 2025)).toBe(0)
  })

  it('reads the date part of an ISO timestamp', () => {
    expect(ageAtEndOfYear('2010-06-14T00:00:00.000Z', 2025)).toBe(15)
  })

  it('is null for an unreadable date, an unborn child or an implausible age', () => {
    expect(ageAtEndOfYear('irgendwann', 2025)).toBeNull()
    expect(ageAtEndOfYear('2026-01-01', 2025)).toBeNull()
    expect(ageAtEndOfYear('1800-01-01', 2025)).toBeNull()
  })
})

describe('todayIso', () => {
  it('is the day in Berlin by default', () => {
    expect(todayIso(new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-01')
    expect(todayIso(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
  })

  it('can use the device time zone', () => {
    const now = new Date(2026, 4, 9, 23, 59)
    expect(todayIso(now, 'local')).toBe('2026-05-09')
  })
})
