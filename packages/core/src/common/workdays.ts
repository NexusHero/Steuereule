export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

export interface WorkdaysInput {
  readonly year: number
  readonly workdays: readonly IsoWeekday[]
  readonly vacationDays: number
  readonly sickDays: number
  readonly homeOfficeDays: number
  /** Public holidays on working days (public-holidays.ts suggests them; the user confirms). */
  readonly publicHolidays?: number
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function calendarDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

function isoWeekdayAt(year: number, dayIndex0: number): IsoWeekday {
  const utcDay = new Date(Date.UTC(year, 0, 1 + dayIndex0)).getUTCDay()
  return (utcDay === 0 ? 7 : utcDay) as IsoWeekday
}

function validateWorkdaysInput(input: WorkdaysInput): void {
  const { year, workdays, vacationDays: vacation, sickDays: sick, homeOfficeDays: homeOffice } = input

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RangeError('year must be an integer calendar year between 2000 and 2100')
  }
  if (workdays.length === 0) {
    throw new RangeError('workdays must name at least one weekday')
  }
  for (const day of workdays) {
    if (!ISO_WEEKDAYS.includes(day)) throw new RangeError(`"${day}" is not an ISO weekday (1-7)`)
  }
  for (const [name, n] of [
    ['vacationDays', vacation],
    ['sickDays', sick],
    ['homeOfficeDays', homeOffice],
  ] as const) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
}

export function weekdaysInYear(year: number, workdays: readonly IsoWeekday[]): number {
  const set = new Set(workdays)
  let count = 0
  for (let d = 0; d < calendarDaysInYear(year); d++) {
    if (set.has(isoWeekdayAt(year, d))) count++
  }
  return count
}

export type WorkdaysConflict =
  | { readonly kind: 'urlaub-krank-uebersteigt-wochentage'; readonly weekdays: number; readonly vacationDays: number; readonly sickDays: number }
  | { readonly kind: 'homeoffice-uebersteigt-werktage'; readonly workdays: number; readonly homeOfficeDays: number }
export type WorkdaysResult =
  | {
      readonly kind: 'bestimmt'
      readonly weekdays: number
      readonly workdays: number
      readonly commuteDays: number
    }
  | { readonly kind: 'widerspruch'; readonly conflict: WorkdaysConflict }

export function calculateWorkdays(input: WorkdaysInput): WorkdaysResult & {
  readonly weekdays?: number
  readonly workdays?: number
  readonly commuteDays?: number
} {
  validateWorkdaysInput(input)
  const { year, workdays: workdaysArr, vacationDays: vacation, sickDays: sick, homeOfficeDays: homeOffice } = input
  const holidays = input.publicHolidays ?? 0

  const weekdays = weekdaysInYear(year, workdaysArr)
  const workdays = weekdays - holidays - vacation - sick
  if (workdays < 0) {
    return {
      kind: 'widerspruch',
      conflict: {
        kind: 'urlaub-krank-uebersteigt-wochentage',
        weekdays,
        vacationDays: vacation,
        sickDays: sick,
      },
    }
  }
  const commuteDays = workdays - homeOffice
  if (commuteDays < 0) {
    return {
      kind: 'widerspruch',
      conflict: { kind: 'homeoffice-uebersteigt-werktage', workdays, homeOfficeDays: homeOffice },
    }
  }
  return {
    kind: 'bestimmt',
    weekdays,
    workdays,
    commuteDays,
  }
}

export interface CommuterAllowanceInput {
  readonly oneWayKm: number
  readonly days: number
  readonly year: number
  readonly withCar: boolean
}

interface Tier {
  readonly firstKm: number
  readonly rateFirst: number
  readonly rateAdditional: number
}

const TIERS: Readonly<Record<number, Tier>> = {
  2021: { firstKm: 20, rateFirst: 0.3, rateAdditional: 0.35 },
  2022: { firstKm: 20, rateFirst: 0.3, rateAdditional: 0.38 },
  2023: { firstKm: 20, rateFirst: 0.3, rateAdditional: 0.38 },
  2024: { firstKm: 20, rateFirst: 0.3, rateAdditional: 0.38 },
  2025: { firstKm: 20, rateFirst: 0.3, rateAdditional: 0.38 },
  2026: { firstKm: 0, rateFirst: 0.38, rateAdditional: 0.38 },
}

const MAXIMUM_AMOUNT_WITHOUT_CAR = 4500

/** Distance commuter allowance per § 9 Abs. 1 Nr. 4 EStG: only full kilometres count; the 4,500 € cap applies only without car. */
export function commuterAllowance(input: CommuterAllowanceInput): number {
  const { oneWayKm: kmInput, days, year, withCar } = input

  if (!Number.isFinite(kmInput) || kmInput < 0) throw new RangeError('km must be a non-negative finite number')
  if (!Number.isInteger(days) || days < 0) throw new RangeError('days must be a non-negative integer')

  let firstKmLimit: number
  let rateFirst: number
  let rateAdditional: number
  let maxCap = MAXIMUM_AMOUNT_WITHOUT_CAR

  if (isSupportedIncomeTaxYear(year)) {
    const commute = getTaxYearParameters(year).commute
    firstKmLimit = commute.firstKmThreshold
    rateFirst = commute.rateFirstEur
    rateAdditional = commute.rateAdditionalEur
    maxCap = commute.maxWithoutCarEur
  } else {
    const tier = TIERS[year]
    if (tier === undefined) throw new RangeError(`no commuter allowance rates for ${year}`)
    firstKmLimit = tier.firstKm
    rateFirst = tier.rateFirst
    rateAdditional = tier.rateAdditional
  }

  const km = Math.floor(kmInput)
  const firstKm = Math.min(km, firstKmLimit)
  const additionalKm = km - firstKm
  const amount = Math.round(days * (firstKm * rateFirst + additionalKm * rateAdditional))
  return withCar ? amount : Math.min(amount, maxCap)
}

/** One way to work in a year, valid from/to (DD.MM.YYYY; null = start/end of the year) (ADR-0079). */
export interface WayToWork {
  readonly oneWayKm: number
  readonly withCar: boolean
  readonly from: string | null
  readonly to: string | null
}

function dayIndex(year: number, date: string | null, fallback: number): number {
  const m = date ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date) : null
  if (!m) return fallback
  const y = Number(m[3])
  if (y < year) return 0
  if (y > year) return calendarDaysInYear(year) - 1
  return Math.round((Date.UTC(year, Number(m[2]) - 1, Number(m[1])) - Date.UTC(year, 0, 1)) / 86_400_000)
}

/** Working weekdays between two dates of the year, both included. */
export function weekdaysInPeriod(year: number, workdays: readonly IsoWeekday[], from: string | null, to: string | null): number {
  const set = new Set(workdays)
  const first = dayIndex(year, from, 0)
  const last = dayIndex(year, to, calendarDaysInYear(year) - 1)
  let count = 0
  for (let d = first; d <= last; d++) if (set.has(isoWeekdayAt(year, d))) count++
  return count
}

/**
 * The year's commute days shared among the ways to work by the weekdays each one lasted; days off and
 * home office are known only for the year, so they fall evenly. One way without dates keeps all days.
 */
export function commuteDaysByWay(year: number, workdays: readonly IsoWeekday[], commuteDays: number, ways: readonly Pick<WayToWork, 'from' | 'to'>[]): number[] {
  if (ways.length === 0) return []
  if (ways.length === 1 && ways[0]!.from === null && ways[0]!.to === null) return [commuteDays]
  const yearWeekdays = weekdaysInYear(year, workdays)
  if (yearWeekdays === 0) return ways.map(() => 0)
  const shares = ways.map((w) => Math.round((commuteDays * weekdaysInPeriod(year, workdays, w.from, w.to)) / yearWeekdays))
  const excess = shares.reduce((s, n) => s + n, 0) - commuteDays
  if (excess > 0) shares[shares.length - 1] = Math.max(0, shares.at(-1)! - excess)
  return shares
}

/** The allowance for each way to work (§ 9 Abs. 1 Nr. 4 EStG), in the order given. */
export function commuterAllowanceByWay(year: number, workdays: readonly IsoWeekday[], commuteDays: number, ways: readonly WayToWork[]): { days: number; allowance: number }[] {
  const days = commuteDaysByWay(year, workdays, commuteDays, ways)
  return ways.map((w, i) => ({ days: days[i]!, allowance: commuterAllowance({ oneWayKm: w.oneWayKm, days: days[i]!, year, withCar: w.withCar }) }))
}
