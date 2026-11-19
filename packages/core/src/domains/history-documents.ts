/**
 * Unterlagen (ADR-0099 §9): how long the Finanzamt took from the submission to the Bescheid. After twelve
 * weeks without a Bescheid the page says „Nachfragen lohnt sich“: a rule of thumb of the app, no deadline
 * of the law.
 */

export const ASK_TAX_OFFICE_AFTER_DAYS = 12 * 7

export interface AssessmentWait {
  readonly days: number
  /** Whole weeks, rounded. */
  readonly weeks: number
  /** No Bescheid yet: the days run up to today. */
  readonly pending: boolean
  readonly askTaxOffice: boolean
}

const dayNumber = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000

export function assessmentWait(submittedOn: string, assessmentDate: string | null, today: string): AssessmentWait {
  const days = Math.max(0, dayNumber(assessmentDate ?? today) - dayNumber(submittedOn))
  const pending = assessmentDate === null
  return { days, weeks: Math.round(days / 7), pending, askTaxOffice: pending && days > ASK_TAX_OFFICE_AFTER_DAYS }
}
