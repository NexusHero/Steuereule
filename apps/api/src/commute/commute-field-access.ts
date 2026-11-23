import { calculateWorkdays, effectivePublicHolidays, germanStateOfAddress, isHolidayRegion } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import { commuteInputsWith } from './commute-field-values.js'
import { WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type CommuteRepository } from './commute.repository.js'
import { assertTravelDaysFit } from './ways-to-work.js'

export const COMMUTE_ACCESS_FIELDS = [
  'workdays',
  'vacationDays',
  'sickDays',
  'homeOfficeDays',
  'oneWayKm',
  'transport',
  'publicHolidays',
  'publicHolidayRegion',
  ...WORK_EXPENSE_AMOUNT_FIELDS,
  ...WORK_EXPENSE_NOTE_FIELDS,
  'periodFrom',
  'periodTo',
  'secondOneWayKm',
  'secondTransport',
  'secondFrom',
  'secondTo',
  'workplace',
  'secondWorkplace',
  'travelDays',
  'secondTravelDays',
  'shortestRouteConfirmed',
  'secondShortestRouteConfirmed',
] as const

/** The postal code of the user's home address, where the master data knows one. */
export type HomePostalCode = (userId: string) => Promise<string | null | undefined>

/** What a year without a commute record starts from: Monday to Friday, nothing else stated. */
const emptyInputs = (): CommuteInputs => ({
  workdays: [1, 2, 3, 4, 5],
  vacationDays: 0,
  sickDays: 0,
  homeOfficeDays: 0,
  oneWayKm: null,
  transport: null,
  workplace: null,
  publicHolidays: null,
  publicHolidayRegion: null,
})

const text = (value: string | number | boolean | null | undefined): string | null => (value === null || value === undefined ? null : String(value))

function fieldsOf(r: CommuteInputs): Record<string, string | null> {
  return {
    workdays: r.workdays.join(','),
    vacationDays: String(r.vacationDays),
    sickDays: String(r.sickDays),
    homeOfficeDays: String(r.homeOfficeDays),
    oneWayKm: text(r.oneWayKm),
    transport: r.transport,
    publicHolidays: text(r.publicHolidays),
    publicHolidayRegion: r.publicHolidayRegion ?? null,
    ...Object.fromEntries(WORK_EXPENSE_AMOUNT_FIELDS.map((f) => [f, text(r[f])])),
    ...Object.fromEntries(WORK_EXPENSE_NOTE_FIELDS.map((f) => [f, r[f] ?? null])),
    periodFrom: r.periodFrom ?? null,
    periodTo: r.periodTo ?? null,
    secondOneWayKm: text(r.secondOneWayKm),
    secondTransport: r.secondTransport ?? null,
    secondFrom: r.secondFrom ?? null,
    secondTo: r.secondTo ?? null,
    workplace: r.workplace ?? null,
    secondWorkplace: r.secondWorkplace ?? null,
    travelDays: text(r.travelDays),
    secondTravelDays: text(r.secondTravelDays),
    shortestRouteConfirmed: text(r.shortestRouteConfirmed),
    secondShortestRouteConfirmed: text(r.secondShortestRouteConfirmed),
  }
}

/**
 * The mask starts from the Bundesland of the home address; a way written here gets the same
 * start, or the workplace's own state when its postal code names one. A region or a count the
 * user set stands, and so does a region cleared in this very write.
 */
async function withHolidayRegion(inputs: CommuteInputs, writtenField: string, userId: string, homePostalCode: HomePostalCode | undefined): Promise<CommuteInputs> {
  const holidaysOpen = !isHolidayRegion(inputs.publicHolidayRegion) && (inputs.publicHolidays ?? null) === null
  if (!holidaysOpen || writtenField === 'publicHolidayRegion' || writtenField === 'publicHolidays') return inputs
  const region = germanStateOfAddress(inputs.workplace) ?? germanStateOfAddress(await homePostalCode?.(userId))
  return region === null ? inputs : { ...inputs, publicHolidayRegion: region }
}

function assertDaysOffFit(taxYear: number, inputs: CommuteInputs): void {
  const workdays = calculateWorkdays({
    year: taxYear,
    workdays: inputs.workdays,
    vacationDays: inputs.vacationDays,
    sickDays: inputs.sickDays,
    homeOfficeDays: inputs.homeOfficeDays,
    publicHolidays: effectivePublicHolidays(taxYear, inputs),
  })
  if (workdays.kind === 'widerspruch') {
    throw new InvalidInputError('ARBEITSTAGE_WIDERSPRUCH', `The days off exceed the working days (${workdays.conflict.kind}).`)
  }
}

/**
 * The confirmation path's view of the screen `commute` (ADR-0066). A write is checked as a whole:
 * the days off against the working days, the days travelled against the period.
 */
export function commuteFieldAccess(commute: CommuteRepository, homePostalCode?: HomePostalCode): ScreenAccess {
  return {
    fields: COMMUTE_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await commute.findForUserAndYear(userId, taxYear)
      return r === null ? Object.fromEntries(COMMUTE_ACCESS_FIELDS.map((f) => [f, null])) : fieldsOf(r)
    },
    async write(userId, taxYear, _instance, field, value) {
      const current = (await commute.findForUserAndYear(userId, taxYear)) ?? emptyInputs()
      const changed = commuteInputsWith(current, field, value)
      if (changed === null) return false
      const updated = await withHolidayRegion(changed, field, userId, homePostalCode)
      assertDaysOffFit(taxYear, updated)
      assertTravelDaysFit(taxYear, updated)
      await commute.save(userId, taxYear, updated)
      return true
    },
  }
}
