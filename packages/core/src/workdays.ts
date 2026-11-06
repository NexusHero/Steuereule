export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

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
  const tier = TIERS[year]
  if (tier === undefined) throw new RangeError(`no commuter allowance rates for ${year}`)
  const km = Math.floor(kmInput)
  const firstKm = Math.min(km, tier.firstKm)
  const additionalKm = km - firstKm
  const amount = Math.round(days * (firstKm * tier.rateFirst + additionalKm * tier.rateAdditional))
  return withCar ? amount : Math.min(amount, MAXIMUM_AMOUNT_WITHOUT_CAR)
}
