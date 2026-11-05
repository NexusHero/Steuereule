import { describe, expect, it } from 'vitest'
import {
  calculateWorkdays,
  isLeapYear,
  calendarDaysInYear,
  commuterAllowance,
  weekdaysInYear,
  type WorkdaysInput,
} from './werktage'

const MO_FR: WorkdaysInput = {
  year: 2026,
  workdays: [1, 2, 3, 4, 5],
  vacationDays: 30,
  sickDays: 5,
  homeOfficeDays: 40,
}

describe('calendar arithmetic (the deterministic "Kalenderlogik statt Freitext" part)', () => {
  it('leap-year detection', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(2000)).toBe(true) // century, divisible by 400
    expect(isLeapYear(1900)).toBe(false) // century, not divisible by 400
  })

  it('a common year has 365 days, a leap year 366', () => {
    expect(calendarDaysInYear(2026)).toBe(365)
    expect(calendarDaysInYear(2024)).toBe(366)
  })

  it('2026 has 261 weekdays (Mon–Fri)', () => {
    // 2026-01-01 is a Thursday; 52 full weeks + extras leave 261 weekdays.
    expect(weekdaysInYear(2026, [1, 2, 3, 4, 5])).toBe(261)
  })

  it('a single weekday repeats either 52 or 53 times', () => {
    for (let jahr = 2024; jahr <= 2027; jahr++) {
      for (const tag of [1, 2, 3, 4, 5, 6, 7] as const) {
        const n = weekdaysInYear(jahr, [tag])
        expect(n).toBeGreaterThanOrEqual(52)
        expect(n).toBeLessThanOrEqual(53)
      }
    }
  })
})

describe('honest boundary: gesetzliche Feiertage are NOT subtracted (deferred)', () => {
  it('counts Neujahr 2026 (Thursday, a gesetzlicher Feiertag) as a regular weekday', () => {
    // 2026-01-01 is both a Thursday and Neujahr — a DE-wide gesetzlicher Feiertag. This slice does
    // NOT subtract Feiertage (the Feiertagskalender is a later slice), so Thursday appears 53 times
    // in 2026, the holiday NOT carved out. This is the honest boundary the header documents:
    // `werktage`/`pendlertage` are "vor Feiertagen", an upper bound.
    expect(weekdaysInYear(2026, [4])).toBe(53)
  })

  it('does NOT reduce a Mon–Fri year by its work-day holidays', () => {
    // 261 weekdays still include the work-day Feiertage (e.g. Neujahr on Thu, Tag der Arbeit on Fri,
    // 1. Weihnachtstag on Fri) — the raw count is NOT corrected down. Proof of the boundary, not a
    // green lie: a true "Arbeitstage" figure would be lower by those holidays.
    expect(weekdaysInYear(2026, [1, 2, 3, 4, 5])).toBe(261)
  })
})

describe('berechneWerktage', () => {
  it('computes werktage and pendlertage from the calendar (vor Feiertagen)', () => {
    // 261 weekdays − 30 Urlaub − 5 krank = 226 werktage; − 40 Homeoffice = 186 pendlertage.
    expect(calculateWorkdays(MO_FR)).toEqual({
      kind: 'bestimmt',
      wochentage: 261,
      werktage: 226,
      pendlertage: 186,
    })
  })

  it('more vacation+sick days than weekdays is a widerspruch, never clamped', () => {
    const daten: WorkdaysInput = { ...MO_FR, vacationDays: 200, sickDays: 100 }
    const r = calculateWorkdays(daten)
    expect(r).toEqual({
      kind: 'widerspruch',
      widerspruch: { art: 'urlaub-krank-uebersteigt-wochentage', wochentage: 261, urlaubstage: 200, krankheitstage: 100 },
    })
  })

  it('more home-office days than werktage is a widerspruch', () => {
    const daten: WorkdaysInput = { ...MO_FR, vacationDays: 0, sickDays: 0, homeOfficeDays: 999 }
    const r = calculateWorkdays(daten)
    expect(r).toEqual({
      kind: 'widerspruch',
      widerspruch: { art: 'homeoffice-uebersteigt-werktage', werktage: 261, homeofficeTage: 999 },
    })
  })

  it('rejects an empty weekday pattern', () => {
    expect(() => calculateWorkdays({ ...MO_FR, workdays: [] })).toThrow(RangeError)
  })

  it('rejects an out-of-range year', () => {
    expect(() => calculateWorkdays({ ...MO_FR, year: 1900 })).toThrow(RangeError)
  })
})

describe('pendlerpauschale (Entfernungspauschale, § 9 Abs. 1 Nr. 4 EStG)', () => {
  it('2025: 0,30 € for each of the first 20 km', () => {
    const betrag = commuterAllowance({ oneWayKm: 15, days: 206, year: 2025, withCar: true })

    expect(betrag).toBe(927)
  })

  it('2025: 0,38 € from the 21st km on', () => {
    const betrag = commuterAllowance({ oneWayKm: 30, days: 206, year: 2025, withCar: true })

    expect(betrag).toBe(2019)
  })

  it('2026: 0,38 € from the first km', () => {
    const betrag = commuterAllowance({ oneWayKm: 30, days: 206, year: 2026, withCar: true })

    expect(betrag).toBe(2348)
  })

  it('counts only full kilometres, as the form asks', () => {
    const betrag = commuterAllowance({ oneWayKm: 15.9, days: 100, year: 2025, withCar: true })

    expect(betrag).toBe(450)
  })

  it('caps at 4.500 € without an own car', () => {
    const betrag = commuterAllowance({ oneWayKm: 100, days: 220, year: 2025, withCar: false })

    expect(betrag).toBe(4500)
  })

  it('does not cap with an own car', () => {
    const betrag = commuterAllowance({ oneWayKm: 100, days: 220, year: 2025, withCar: true })

    expect(betrag).toBe(8008)
  })

  it('rejects impossible inputs', () => {
    expect(() => commuterAllowance({ oneWayKm: -1, days: 10, year: 2025, withCar: true })).toThrow(RangeError)
    expect(() => commuterAllowance({ oneWayKm: 10, days: -1, year: 2025, withCar: true })).toThrow(RangeError)
    expect(() => commuterAllowance({ oneWayKm: 10, days: 10, year: 2019, withCar: true })).toThrow(RangeError)
  })
})

describe('calculateWorkdays with public holidays (F4)', () => {
  it('subtracts the confirmed holidays from the working days', () => {
    const ohne = calculateWorkdays({ year: 2025, workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 4, homeOfficeDays: 0 })
    const mit = calculateWorkdays({ year: 2025, workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 4, homeOfficeDays: 0, publicHolidays: 11 })
    if (ohne.kind !== 'bestimmt' || mit.kind !== 'bestimmt') throw new Error('expected a result')
    expect(mit.pendlertage).toBe(ohne.pendlertage - 11)
  })
})
