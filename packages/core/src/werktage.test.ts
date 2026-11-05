import { describe, expect, it } from 'vitest'
import {
  berechneWerktage,
  istSchaltjahr,
  kalendertageImJahr,
  pendlerpauschale,
  wochentageImJahr,
  type WerktageEingabe,
} from './werktage'

const MO_FR: WerktageEingabe = {
  jahr: 2026,
  werktage: [1, 2, 3, 4, 5],
  urlaubstage: 30,
  krankheitstage: 5,
  homeofficeTage: 40,
}

describe('calendar arithmetic (the deterministic "Kalenderlogik statt Freitext" part)', () => {
  it('leap-year detection', () => {
    expect(istSchaltjahr(2024)).toBe(true)
    expect(istSchaltjahr(2026)).toBe(false)
    expect(istSchaltjahr(2000)).toBe(true) // century, divisible by 400
    expect(istSchaltjahr(1900)).toBe(false) // century, not divisible by 400
  })

  it('a common year has 365 days, a leap year 366', () => {
    expect(kalendertageImJahr(2026)).toBe(365)
    expect(kalendertageImJahr(2024)).toBe(366)
  })

  it('2026 has 261 weekdays (Mon–Fri)', () => {
    // 2026-01-01 is a Thursday; 52 full weeks + extras leave 261 weekdays.
    expect(wochentageImJahr(2026, [1, 2, 3, 4, 5])).toBe(261)
  })

  it('a single weekday repeats either 52 or 53 times', () => {
    for (let jahr = 2024; jahr <= 2027; jahr++) {
      for (const tag of [1, 2, 3, 4, 5, 6, 7] as const) {
        const n = wochentageImJahr(jahr, [tag])
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
    expect(wochentageImJahr(2026, [4])).toBe(53)
  })

  it('does NOT reduce a Mon–Fri year by its work-day holidays', () => {
    // 261 weekdays still include the work-day Feiertage (e.g. Neujahr on Thu, Tag der Arbeit on Fri,
    // 1. Weihnachtstag on Fri) — the raw count is NOT corrected down. Proof of the boundary, not a
    // green lie: a true "Arbeitstage" figure would be lower by those holidays.
    expect(wochentageImJahr(2026, [1, 2, 3, 4, 5])).toBe(261)
  })
})

describe('berechneWerktage', () => {
  it('computes werktage and pendlertage from the calendar (vor Feiertagen)', () => {
    // 261 weekdays − 30 Urlaub − 5 krank = 226 werktage; − 40 Homeoffice = 186 pendlertage.
    expect(berechneWerktage(MO_FR)).toEqual({
      kind: 'bestimmt',
      wochentage: 261,
      werktage: 226,
      pendlertage: 186,
    })
  })

  it('more vacation+sick days than weekdays is a widerspruch, never clamped', () => {
    const daten: WerktageEingabe = { ...MO_FR, urlaubstage: 200, krankheitstage: 100 }
    const r = berechneWerktage(daten)
    expect(r).toEqual({
      kind: 'widerspruch',
      widerspruch: { art: 'urlaub-krank-uebersteigt-wochentage', wochentage: 261, urlaubstage: 200, krankheitstage: 100 },
    })
  })

  it('more home-office days than werktage is a widerspruch', () => {
    const daten: WerktageEingabe = { ...MO_FR, urlaubstage: 0, krankheitstage: 0, homeofficeTage: 999 }
    const r = berechneWerktage(daten)
    expect(r).toEqual({
      kind: 'widerspruch',
      widerspruch: { art: 'homeoffice-uebersteigt-werktage', werktage: 261, homeofficeTage: 999 },
    })
  })

  it('rejects an empty weekday pattern', () => {
    expect(() => berechneWerktage({ ...MO_FR, werktage: [] })).toThrow(RangeError)
  })

  it('rejects an out-of-range year', () => {
    expect(() => berechneWerktage({ ...MO_FR, jahr: 1900 })).toThrow(RangeError)
  })
})

describe('pendlerpauschale (Entfernungspauschale, § 9 Abs. 1 Nr. 4 EStG)', () => {
  it('2025: 0,30 € for each of the first 20 km', () => {
    const betrag = pendlerpauschale({ einfacheKm: 15, tage: 206, jahr: 2025, mitPkw: true })

    expect(betrag).toBe(927)
  })

  it('2025: 0,38 € from the 21st km on', () => {
    const betrag = pendlerpauschale({ einfacheKm: 30, tage: 206, jahr: 2025, mitPkw: true })

    expect(betrag).toBe(2019)
  })

  it('2026: 0,38 € from the first km', () => {
    const betrag = pendlerpauschale({ einfacheKm: 30, tage: 206, jahr: 2026, mitPkw: true })

    expect(betrag).toBe(2348)
  })

  it('counts only full kilometres, as the form asks', () => {
    const betrag = pendlerpauschale({ einfacheKm: 15.9, tage: 100, jahr: 2025, mitPkw: true })

    expect(betrag).toBe(450)
  })

  it('caps at 4.500 € without an own car', () => {
    const betrag = pendlerpauschale({ einfacheKm: 100, tage: 220, jahr: 2025, mitPkw: false })

    expect(betrag).toBe(4500)
  })

  it('does not cap with an own car', () => {
    const betrag = pendlerpauschale({ einfacheKm: 100, tage: 220, jahr: 2025, mitPkw: true })

    expect(betrag).toBe(8008)
  })

  it('rejects impossible inputs', () => {
    expect(() => pendlerpauschale({ einfacheKm: -1, tage: 10, jahr: 2025, mitPkw: true })).toThrow(RangeError)
    expect(() => pendlerpauschale({ einfacheKm: 10, tage: -1, jahr: 2025, mitPkw: true })).toThrow(RangeError)
    expect(() => pendlerpauschale({ einfacheKm: 10, tage: 10, jahr: 2019, mitPkw: true })).toThrow(RangeError)
  })
})
