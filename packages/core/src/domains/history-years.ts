import { nextWorkingDay } from '../engine/assessment'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { voluntaryFilingDeadlineFor } from './deadlines'

/**
 * „Hier liegt noch Geld“ (ADR-0099 §1): which years a return can still be filed for, until when, and the
 * one-time question „Schon abgegeben?“ for a year the app has no data of.
 */

/** A return can be filed for four years after the tax year (§ 169 Abs. 2 Satz 1 Nr. 2 AO). */
export const ASSESSMENT_PERIOD_YEARS = 4
/** § 170 Abs. 2 Satz 1 Nr. 1 AO: a mandatory return delays the start of the period by three years at most. */
const MAX_START_DELAY_YEARS = 3
/** „Weiß nicht“ asks again this many months before the period ends. */
export const ASK_AGAIN_MONTHS_BEFORE_DEADLINE = 3

export const FILED_ELSEWHERE_ANSWERS = ['ja', 'nein', 'weiss-nicht'] as const
export type FiledElsewhereAnswer = (typeof FILED_ELSEWHERE_ANSWERS)[number]

export function isFiledElsewhereAnswer(value: string): value is FiledElsewhereAnswer {
  return (FILED_ELSEWHERE_ANSWERS as readonly string[]).includes(value)
}

const dayNumber = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000

/** The period's last day for a start at the end of `startYear`, moved to the next working day (§ 108 Abs. 3 AO). */
const periodEndFrom = (startYear: number): string => nextWorkingDay(`${startYear + ASSESSMENT_PERIOD_YEARS}-12-31`)

/**
 * The last day of the Festsetzungsfrist without a delayed start: the deadline of a voluntary return and
 * the earliest the period of any return can end. The tariff years keep it in their parameters; other
 * years follow the same rule, so a Bescheid of 2019 gets its day too.
 */
export function assessmentPeriodEnd(taxYear: number): string {
  return isSupportedIncomeTaxYear(taxYear) ? voluntaryFilingDeadlineFor(taxYear) : periodEndFrom(taxYear)
}

/**
 * The period's end if the return was mandatory: it then starts at the end of the year it was filed,
 * at most three years late. Whether a return was mandatory the app does not know, so this is only
 * ever shown next to the earlier end, never instead of it (ADR-0032).
 */
export function assessmentPeriodEndIfMandatory(taxYear: number, filedOn: string): string {
  const filedYear = Number(filedOn.slice(0, 4))
  return periodEndFrom(Math.max(taxYear, Math.min(filedYear, taxYear + MAX_START_DELAY_YEARS)))
}

/** The years before the current one whose period still runs: at most four, oldest first. */
export function openAssessmentPeriodYears(today: string): number[] {
  const current = Number(today.slice(0, 4))
  const years: number[] = []
  for (let year = current - ASSESSMENT_PERIOD_YEARS - 1; year < current; year++) {
    if (dayNumber(assessmentPeriodEnd(year)) >= dayNumber(today)) years.push(year)
  }
  return years
}

export interface YearDeadline {
  /** `abgabe-moeglich-bis` for a year without a Bescheid, `aenderbar-bis` once one is there. */
  readonly kind: 'abgabe-moeglich-bis' | 'aenderbar-bis'
  /** The earliest end, true for every return. */
  readonly endsOn: string
  readonly remainingDays: number
  readonly running: boolean
  /** The later end should the return have been mandatory; null when it is the same day or unknown. */
  readonly endsOnIfMandatory: string | null
}

export function yearDeadline(input: { readonly year: number; readonly assessed: boolean; readonly filedOn: string | null }, today: string): YearDeadline {
  const endsOn = assessmentPeriodEnd(input.year)
  const remainingDays = dayNumber(endsOn) - dayNumber(today)
  const mandatory = input.filedOn === null ? null : assessmentPeriodEndIfMandatory(input.year, input.filedOn)
  return {
    kind: input.assessed ? 'aenderbar-bis' : 'abgabe-moeglich-bis',
    endsOn,
    remainingDays,
    running: remainingDays >= 0,
    endsOnIfMandatory: mandatory !== null && mandatory !== endsOn ? mandatory : null,
  }
}

export interface StoredFiledElsewhere {
  readonly answer: FiledElsewhereAnswer
  readonly answeredOn: string
}

export interface FiledElsewhereState {
  readonly answer: FiledElsewhereAnswer | null
  readonly answeredOn: string | null
  /** After „Weiß nicht“: from this day the question comes again. */
  readonly askAgainFrom: string | null
  /** Whether the app asks „Schon abgegeben?“ now. */
  readonly ask: boolean
}

/** The same day `months` earlier, or the last day of that month (31.12. → 30.09.). */
function monthsBefore(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7)) - months
  const target = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(Number(iso.slice(8, 10)), lastDay))
  return target.toISOString().slice(0, 10)
}

/** The question asks once; „Weiß nicht“ brings it back three months before the period ends, and never after. */
export function filedElsewhereState(year: number, stored: StoredFiledElsewhere | null, today: string): FiledElsewhereState {
  const end = assessmentPeriodEnd(year)
  const running = dayNumber(end) >= dayNumber(today)
  if (stored === null) return { answer: null, answeredOn: null, askAgainFrom: null, ask: running }
  if (stored.answer !== 'weiss-nicht') return { answer: stored.answer, answeredOn: stored.answeredOn, askAgainFrom: null, ask: false }
  const askAgainFrom = monthsBefore(end, ASK_AGAIN_MONTHS_BEFORE_DEADLINE)
  return { answer: stored.answer, answeredOn: stored.answeredOn, askAgainFrom, ask: running && dayNumber(today) >= dayNumber(askAgainFrom) }
}
