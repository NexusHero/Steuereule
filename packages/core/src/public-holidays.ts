import type { IsoWeekday } from './werktage'

/**
 * Public holidays for the commute (finding F4 of the 2025 test run: without them the Pendlertage were
 * about ten days too many). A suggestion the user confirms — the employer's calendar can differ, so the
 * mask always lets the number be changed. Grenzgänger count the holidays of the canton they work in.
 */
export const GERMAN_STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const
export const SWISS_CANTONS = ['BS', 'BL', 'AG', 'ZH', 'SH-CH', 'TG'] as const
export type HolidayRegion = (typeof GERMAN_STATES)[number] | (typeof SWISS_CANTONS)[number]

/** Easter Sunday (anonymous Gregorian algorithm), as a UTC date. */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const fixed = (year: number, month: number, day: number) => iso(new Date(Date.UTC(year, month - 1, day)))
const fromEaster = (year: number, offset: number) => {
  const d = easterSunday(year)
  d.setUTCDate(d.getUTCDate() + offset)
  return iso(d)
}

/** Buß- und Bettag: the Wednesday before 23 November. */
function bussUndBettag(year: number): string {
  const d = new Date(Date.UTC(year, 10, 22))
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1)
  return iso(d)
}

/** The holidays (ISO dates) of one state or canton in one year. Regional and municipal ones are left out. */
export function publicHolidays(year: number, region: HolidayRegion): readonly string[] {
  const has = (...regions: HolidayRegion[]) => regions.includes(region)
  if ((SWISS_CANTONS as readonly string[]).includes(region)) {
    return [
      fixed(year, 1, 1),
      ...(has('ZH', 'AG', 'SH-CH', 'TG') ? [fixed(year, 1, 2)] : []), // Berchtoldstag
      fromEaster(year, -2), // Karfreitag
      fromEaster(year, 1), // Ostermontag
      ...(has('BS', 'BL', 'ZH', 'SH-CH', 'TG') ? [fixed(year, 5, 1)] : []), // Tag der Arbeit
      fromEaster(year, 39), // Auffahrt
      fromEaster(year, 50), // Pfingstmontag
      fixed(year, 8, 1), // Bundesfeier
      fixed(year, 12, 25),
      fixed(year, 12, 26), // Stephanstag
    ]
  }
  return [
    fixed(year, 1, 1),
    ...(has('BW', 'BY', 'ST') ? [fixed(year, 1, 6)] : []),
    ...(has('BE', 'MV') ? [fixed(year, 3, 8)] : []),
    fromEaster(year, -2),
    fromEaster(year, 1),
    fixed(year, 5, 1),
    fromEaster(year, 39),
    fromEaster(year, 50),
    ...(has('BW', 'BY', 'HE', 'NW', 'RP', 'SL') ? [fromEaster(year, 60)] : []), // Fronleichnam
    ...(has('SL') ? [fixed(year, 8, 15)] : []),
    ...(has('TH') ? [fixed(year, 9, 20)] : []),
    fixed(year, 10, 3),
    ...(has('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH') ? [fixed(year, 10, 31)] : []),
    ...(has('BW', 'BY', 'NW', 'RP', 'SL') ? [fixed(year, 11, 1)] : []),
    ...(has('SN') ? [bussUndBettag(year)] : []),
    fixed(year, 12, 25),
    fixed(year, 12, 26),
  ]
}

/** How many of the region's holidays fall on the days the person works. */
export function holidaysOnWorkdays(year: number, region: HolidayRegion, workdays: readonly IsoWeekday[]): number {
  return publicHolidays(year, region).filter((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    return workdays.includes((weekday === 0 ? 7 : weekday) as IsoWeekday)
  }).length
}
