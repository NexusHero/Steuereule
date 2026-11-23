import { assessmentPosition, isAssessmentPositionId, type AssessmentDiff, type AssessmentLesson, type AssessmentPositionId, type AssessmentPositionType } from './assessment'

/**
 * Patterns over the user's own Bescheide (ADR-0099 §3, §5). Nothing here forecasts: a pattern names only
 * what the Bescheide of past years said.
 */

// ---------------------------------------------------------------------------------------------
// §3 Vorauszahlungen
// ---------------------------------------------------------------------------------------------

/** The one hint at a Nachzahlung (ADR-0099 §3): a procedure, no saving tip. */
export const PREPAYMENT_HINT = 'Vorauszahlungen anpassen lassen (Antrag beim Finanzamt)'

export interface PrepaymentYear {
  readonly year: number
  /** The Abschlusszahlung laut Bescheid: positive = Erstattung, negative = Nachzahlung. */
  readonly refund: number
  /** The Nachzahlung as a positive amount; null for a refund or zero. */
  readonly backPayment: number | null
  /** The prepayments the year's answers name; null when none are recorded. */
  readonly prepayments: number | null
  readonly adjustPrepayments: boolean
}

export interface PrepaymentSeries {
  readonly years: readonly PrepaymentYear[]
  readonly backPaymentYears: number
  /** Nachzahlungen in a row up to the latest year with a Bescheid. */
  readonly consecutiveBackPayments: number
  /** The average Nachzahlung over the years that had one, whole euros. */
  readonly averageBackPayment: number | null
  readonly hint: string | null
}

/** The Bescheid years with their Abschlusszahlung, oldest first. */
export function prepaymentSeries(assessed: ReadonlyArray<{ readonly year: number; readonly refund: number; readonly prepayments: number | null }>): PrepaymentSeries {
  const years = [...assessed]
    .sort((a, b) => a.year - b.year)
    .map((y): PrepaymentYear => ({ year: y.year, refund: y.refund, backPayment: y.refund < 0 ? -y.refund : null, prepayments: y.prepayments, adjustPrepayments: y.refund < 0 }))
  const backPayments = years.flatMap((y) => (y.backPayment === null ? [] : [y.backPayment]))
  let consecutive = 0
  while (consecutive < years.length && years[years.length - 1 - consecutive]!.backPayment !== null) consecutive += 1
  return {
    years,
    backPaymentYears: backPayments.length,
    consecutiveBackPayments: consecutive,
    averageBackPayment: backPayments.length === 0 ? null : Math.round(backPayments.reduce((s, v) => s + v, 0) / backPayments.length),
    hint: backPayments.length === 0 ? null : PREPAYMENT_HINT,
  }
}

// ---------------------------------------------------------------------------------------------
// §5 Wiederholt gekürzt
// ---------------------------------------------------------------------------------------------

/** The Bescheid-Abgleich of one filing of one year, with its lessons (ADR-0098 §8). */
export interface YearAssessmentDiff {
  readonly year: number
  /** Whose single return; null for the joint one. */
  readonly person: 'A' | 'B' | null
  readonly diff: AssessmentDiff
  readonly lessons: readonly AssessmentLesson[]
}

export interface RepeatedCut {
  /** The position as a joint Bescheid names it: a single return of B is read as B's column. */
  readonly position: AssessmentPositionId
  readonly type: AssessmentPositionType
  readonly person: 'A' | 'B' | null
  readonly label: string
  readonly years: ReadonlyArray<{ readonly year: number; readonly declared: number; readonly assessed: number; readonly difference: number; readonly refundEffect: number | null }>
  /** The catalogue's hint for the position type; null without an entry. */
  readonly hint: string | null
}

/** A higher wage or a lower credit costs the user; for every other own position less is the cut. */
const COSTS_WHEN_HIGHER: ReadonlySet<AssessmentPositionType> = new Set(['bruttoarbeitslohn'])

function isCut(type: AssessmentPositionType, difference: number, refundEffect: number | null): boolean {
  if (refundEffect !== null && refundEffect !== 0) return refundEffect < 0
  return COSTS_WHEN_HIGHER.has(type) ? difference > 0 : difference < 0
}

/** The position id in the joint form: B's single return keeps its one column as `…A`. */
function householdPosition(position: AssessmentPositionId, filingPerson: 'A' | 'B' | null): { id: AssessmentPositionId; person: 'A' | 'B' | null } {
  const def = assessmentPosition(position)
  if (filingPerson !== 'B' || def.person !== 'A') return { id: position, person: def.person }
  const asB = `${position.slice(0, -1)}B`
  return isAssessmentPositionId(asB) ? { id: asB, person: 'B' } : { id: position, person: def.person }
}

/** The positions the Finanzamt cut in at least two Bescheid years (ADR-0099 §5), each year once. */
export function repeatedCuts(diffs: readonly YearAssessmentDiff[]): RepeatedCut[] {
  const byPosition = new Map<AssessmentPositionId, { person: 'A' | 'B' | null; hint: string | null; years: Map<number, RepeatedCut['years'][number]> }>()
  for (const { year, person, diff, lessons } of diffs) {
    for (const d of diff.ownDeviations) {
      const type = assessmentPosition(d.position).type
      if (d.declared === null || d.assessed === null || d.difference === null || !isCut(type, d.difference, d.refundEffect)) continue
      const { id, person: owner } = householdPosition(d.position, person)
      const entry = byPosition.get(id) ?? { person: owner, hint: null, years: new Map() }
      entry.hint ??= lessons.find((l) => l.position === d.position)?.hint ?? null
      if (!entry.years.has(year)) entry.years.set(year, { year, declared: d.declared, assessed: d.assessed, difference: d.difference, refundEffect: d.refundEffect })
      byPosition.set(id, entry)
    }
  }
  return [...byPosition.entries()]
    .filter(([, e]) => e.years.size >= 2)
    .map(([position, e]) => ({
      position,
      type: assessmentPosition(position).type,
      person: e.person,
      label: assessmentPosition(position).label,
      years: [...e.years.values()].sort((a, b) => a.year - b.year),
      hint: e.hint,
    }))
}
