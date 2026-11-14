import type { IsoWeekday } from '@steuereule/core'

export type MeansOfTransport = 'pkw' | 'oepnv' | 'andere'
export const MEANS_OF_TRANSPORT: readonly MeansOfTransport[] = ['pkw', 'oepnv', 'andere']

/** Further Werbungskosten of this person (ADR-0076); on save, undefined keeps what is stored. */
export interface WorkExpenses {
  readonly professionalBodiesEur?: number | null
  readonly professionalBodiesNote?: string | null
  readonly workEquipmentEur?: number | null
  readonly workEquipmentNote?: string | null
  readonly accountFeesEur?: number | null
  readonly otherWorkExpensesEur?: number | null
  readonly otherWorkExpensesNote?: string | null
}

/**
 * A way to work that did not last the whole year, and the second way after a change of job (ADR-0079).
 * Dates as DD.MM.YYYY; on save, undefined keeps what is stored.
 */
export interface WaysToWork {
  readonly periodFrom?: string | null
  readonly periodTo?: string | null
  readonly secondOneWayKm?: number | null
  readonly secondTransport?: MeansOfTransport | null
  readonly secondWorkplace?: string | null
  readonly secondFrom?: string | null
  readonly secondTo?: string | null
}

export const WAY_TEXT_FIELDS = ['periodFrom', 'periodTo', 'secondTransport', 'secondWorkplace', 'secondFrom', 'secondTo'] as const

export const WORK_EXPENSE_AMOUNT_FIELDS = ['professionalBodiesEur', 'workEquipmentEur', 'accountFeesEur', 'otherWorkExpensesEur'] as const
export const WORK_EXPENSE_NOTE_FIELDS = ['professionalBodiesNote', 'workEquipmentNote', 'otherWorkExpensesNote'] as const

export interface CommuteInputs extends WorkExpenses, WaysToWork {
  readonly workdays: readonly (IsoWeekday | IsoWeekday)[]
  readonly vacationDays: number
  readonly sickDays: number
  readonly homeOfficeDays: number
  readonly oneWayKm: number | null
  readonly transport: MeansOfTransport | null
  readonly workplace: string | null
  /** Confirmed public holidays on working days (F4); null = none counted. */
  readonly publicHolidays?: number | null
  /** The state or canton the suggestion came from (public-holidays.ts). */
  readonly publicHolidayRegion?: string | null
}

export const COMMUTE_REPOSITORY = Symbol('COMMUTE_REPOSITORY')

/** The persistence seam for the commute facts behind the Entfernungspauschale. */
export interface CommuteRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<CommuteInputs | null>
  save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteInputs>
}
