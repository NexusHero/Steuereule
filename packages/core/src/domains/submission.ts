import type { AssessmentPositionValues } from './assessment'
import type { Range } from '../common/range'
import type { EstimateChurchTax } from './church-tax'
import { isIsoDate } from '../common/dates'
import type { TaxYearStatus } from './tax-year-status'
import type { PersonYearFacts } from './year-history'

/**
 * The Abgabe (ADR-0098 §8): the app prints the forms, the user files them himself on paper or in
 * ELSTER and then tells the app he did. That moment freezes the version the Bescheid-Abgleich later
 * compares against, so answers changed afterwards do not move the diff.
 */

/** Why a submission date is refused; null when it is fine. */
export type SubmissionDateProblem = 'format' | 'vor-jahresende' | 'in-der-zukunft'

/** The day the user says he filed: an existing ISO date after the tax year ended and not after today. */
export function submissionDateProblem(submittedOn: string, taxYear: number, today: string): SubmissionDateProblem | null {
  if (!isIsoDate(submittedOn)) return 'format'
  // A return can be filed only once its year is over; ISO dates compare as strings.
  if (submittedOn <= `${taxYear}-12-31`) return 'vor-jahresende'
  if (submittedOn > today) return 'in-der-zukunft'
  return null
}

/**
 * The submission is a fact the user reports, not a step of the app's own flow, so it is not bound to the
 * `pruefung` step of ADR-0039: any year still in the hands of the user may be marked as filed, and a filed
 * one again (a corrected return). A year with a Bescheid or an Eckjahr has nothing left to file.
 */
const RECORDABLE: ReadonlySet<TaxYearStatus> = new Set(['entwurf', 'pruefung', 'eingereicht', 'rueckfrage'])
const WITHDRAWABLE: ReadonlySet<TaxYearStatus> = new Set(['eingereicht', 'rueckfrage'])

export function canRecordSubmission(status: TaxYearStatus): boolean {
  return RECORDABLE.has(status)
}

export function canWithdrawSubmission(status: TaxYearStatus): boolean {
  return WITHDRAWABLE.has(status)
}

/** The estimate figures the frozen version takes; the Cockpit's `spanne` estimate has this shape. */
export interface SubmissionEstimate {
  readonly provision: Range
  readonly specialExpenses: number
  readonly taxableIncome: Range
  readonly incomeTax: Range
  readonly solidaritaetszuschlag: Range
  readonly anrechnung: number
  /** Positive = Erstattung, negative = Nachzahlung; prepayments already counted. */
  readonly result: Range
  readonly churchTax?: EstimateChurchTax | undefined
  /** Income tax prepayments of the year (§ 37 EStG), credited like withheld wage tax. */
  readonly prepayments?: number | undefined
  /**
   * How the estimate came about (its own `breakdown`): the declared wage, Werbungskosten and credit are
   * read from here, so they are the estimate's figures and not a second assembly of the same facts.
   */
  readonly breakdown?: DeclaredFromEstimate | undefined
}

/**
 * What the declared positions take from the estimate's breakdown. Declared here, structurally, because this
 * folder lies below the engine and must not import it; the engine's `EstimateBreakdown` satisfies it.
 */
export interface DeclaredFromEstimate {
  readonly persons?: readonly { readonly workExpensesEur: number; readonly grossWageEur?: number; readonly wageTaxEur?: number }[]
  readonly householdReductionEur?: number
}

export interface FiledPositionsInput {
  readonly filingType: 'einzel' | 'zusammen'
  readonly people: { readonly A: PersonYearFacts; readonly B: PersonYearFacts | null }
  /** Null when the core cannot estimate the year: then only the facts are frozen. */
  readonly estimate: SubmissionEstimate | null
}

/**
 * The positions of one person as declared: the gross wage and the Werbungskosten parts with their sum.
 * What is not known is left out, never written as 0 — the diff reads a missing position as not declared.
 */
export function declaredPersonPositions(column: 'A' | 'B', facts: PersonYearFacts): AssessmentPositionValues {
  const out: Record<string, number> = {}
  if (facts.wage) out[`bruttoarbeitslohn${column}`] = facts.wage.gross
  const w = facts.declaredWorkExpenses
  if (w) {
    Object.assign(out, {
      [`fahrtweg${column}`]: w.fahrtweg,
      [`homeoffice${column}`]: w.homeoffice,
      [`arbeitsmittel${column}`]: w.arbeitsmittel,
      [`sonstigeWerbungskosten${column}`]: w.sonstiges,
      [`werbungskosten${column}`]: w.fahrtweg + w.homeoffice + w.arbeitsmittel + w.sonstiges,
    })
  }
  return out as AssessmentPositionValues
}

/**
 * One whole-euro value for a range. The Bescheid-Abgleich compares single amounts, so the frozen version
 * needs one; the middle of the range is the honest one. The range itself is frozen beside it
 * (`estimateAtSubmission`) and is what the Verlauf shows as the estimate.
 */
const pointOf = (r: Range): number => Math.round((r.from + r.to) / 2)

/** The return as filed, in the position ids of the Bescheid-Abgleich (ADR-0098 §8). */
export function filedPositions(input: FiledPositionsInput): AssessmentPositionValues {
  const out: Record<string, number> = { ...declaredPersonPositions('A', input.people.A) }
  const joint = input.filingType === 'zusammen' && input.people.B !== null
  if (joint && input.people.B) Object.assign(out, declaredPersonPositions('B', input.people.B))
  const e = input.estimate
  if (e) {
    // The estimate counts every wage of the year and every Werbungskosten the way the tariff does (lump sum,
    // half the Swiss accident insurance premium): where it names a person's wage, that is the declared wage.
    const persons = (e.breakdown?.persons ?? []).slice(0, joint ? 2 : 1)
    persons.forEach((p, i) => {
      if (p.grossWageEur === undefined) return
      const column = i === 0 ? 'A' : 'B'
      out[`bruttoarbeitslohn${column}`] = p.grossWageEur
      out[`werbungskosten${column}`] = p.workExpensesEur
    })
    // The Bescheid's „Anrechnung“ is the withheld wage tax; prepayments stand on their own line there.
    const credited = e.breakdown?.persons ? persons.reduce((sum, p) => sum + (p.wageTaxEur ?? 0), 0) : e.anrechnung
    const reduction35a = e.breakdown?.householdReductionEur ?? 0
    Object.assign(out, {
      vorsorgeaufwand: pointOf(e.provision),
      sonderausgaben: e.specialExpenses,
      zuVersteuerndesEinkommen: pointOf(e.taxableIncome),
      festgesetzteSteuer: pointOf(e.incomeTax),
      solidaritaetszuschlag: pointOf(e.solidaritaetszuschlag),
      anrechnung: credited,
      erstattung: pointOf(e.result),
    })
    if (reduction35a > 0) out.steuerermaessigung35a = reduction35a
    // Church tax is frozen only once the estimate knows it; an open church tax is not declared as 0.
    if (e.churchTax?.kind === 'spanne') out.kirchensteuer = pointOf(e.churchTax.due)
    else if (e.churchTax?.kind === 'none') out.kirchensteuer = 0
  }
  return out as AssessmentPositionValues
}
