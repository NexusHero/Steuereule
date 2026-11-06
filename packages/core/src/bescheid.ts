import type { CalculationStatus } from './berechnung'
import type { EmployeeFacts } from './angestellte'

export type AssessmentAmountField = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'
export type AssessmentOnlyField = 'festgesetzteSteuer' | 'erstattung'
export type AssessmentField = AssessmentAmountField | AssessmentOnlyField
export type AssessmentFieldDef = {
  readonly id: AssessmentField
  readonly signed: boolean
  readonly comparable: boolean
}

export const ASSESSMENT_FIELDS: readonly AssessmentFieldDef[] = [
  { id: 'einnahmen', signed: false, comparable: true },
  { id: 'vorsorgeaufwand', signed: false, comparable: true },
  { id: 'anrechnung', signed: false, comparable: true },
  { id: 'festgesetzteSteuer', signed: false, comparable: false },
  { id: 'erstattung', signed: true, comparable: false },
]

export const ASSESSMENT_FIELD_IDS: readonly AssessmentField[] = ASSESSMENT_FIELDS.map((f) => f.id)

export const ASSESSMENT_COMPARABLE_FIELDS: readonly AssessmentAmountField[] = ASSESSMENT_FIELDS.filter(
  (f): f is AssessmentFieldDef & { id: AssessmentAmountField } => f.comparable,
).map((f) => f.id)

export type AssessmentValues = Partial<Record<AssessmentField, number>>

/** A deviation on one of the three comparable buckets. */
export interface AssessmentDeviation {
  readonly field: AssessmentAmountField
  readonly assessment: number
  readonly calculated: number
  readonly difference: number
}

export interface AssessmentComparison {
  readonly deviations: readonly AssessmentDeviation[]
  readonly calculationIncomplete: boolean
}

export function reconcileAssessment(values: AssessmentValues, status: CalculationStatus): AssessmentComparison {
  const deviations: AssessmentDeviation[] = []
  for (const field of ASSESSMENT_COMPARABLE_FIELDS) {
    const assessment = values[field]
    if (assessment === undefined) continue
    const calculated = status[field]
    if (assessment !== calculated) {
      deviations.push({ field, assessment, calculated, difference: assessment - calculated })
    }
  }
  return { deviations, calculationIncomplete: status.kind === 'offen' }
}

export function assessmentCalculationStatus(employee: EmployeeFacts, ch: CalculationStatus | null): CalculationStatus {
  const einnahmen = employee.einnahmen + (ch?.einnahmen ?? 0)
  const vorsorgeaufwand = ch?.vorsorgeaufwand ?? 0
  const anrechnung = ch?.anrechnung ?? 0
  const openItems = employee.openItems + (ch?.kind === 'offen' ? ch.openItems : 0)
  const conflicts = employee.conflicts + (ch?.kind === 'offen' ? ch.conflicts : 0)
  const gated = [...new Set([...employee.gated, ...(ch?.kind === 'offen' ? ch.gated : [])])]
  const unconfirmedItems = ch?.kind === 'offen' ? ch.unconfirmedItems : 0
  const unconfirmedSum = ch?.kind === 'offen' ? ch.unconfirmedSum : 0
  const open = openItems > 0 || conflicts > 0 || gated.length > 0 || unconfirmedItems > 0
  return open
    ? { kind: 'offen', einnahmen, vorsorgeaufwand, anrechnung, openItems, conflicts, gated, unconfirmedItems, unconfirmedSum }
    : { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
}

/** An IMMUTABLE snapshot of a submitted filing — the "Fassung". */
export interface FilingVersion {
  readonly number: number
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
}

export type VersionField = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'

/** A single correction to apply to the eingereichte Fassung. */
export interface VersionCorrection {
  readonly field: VersionField
  readonly newAmount: number
}

export interface VersionDeviation {
  readonly field: VersionField
  readonly before: number
  readonly after: number
  readonly difference: number
}

export interface CorrectionResult {
  readonly version: FilingVersion
  readonly deviations: readonly VersionDeviation[]
}

export function correctVersion(previousVersion: FilingVersion, corrections: readonly VersionCorrection[]): CorrectionResult {
  const version: { number: number; einnahmen: number; vorsorgeaufwand: number; anrechnung: number } = {
    ...previousVersion,
    number: previousVersion.number + 1,
  }
  const deviations: VersionDeviation[] = []
  for (const k of corrections) {
    if (!Number.isInteger(k.newAmount) || k.newAmount < 0) {
      throw new RangeError(`korrektur: neuerBetrag must be a non-negative integer`)
    }
    const before = version[k.field]
    version[k.field] = k.newAmount
    if (before !== k.newAmount) {
      deviations.push({ field: k.field, before, after: k.newAmount, difference: k.newAmount - before })
    }
  }
  return { version, deviations }
}

export const APPEAL_REASONS = ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'] as const
export type AppealReason = (typeof APPEAL_REASONS)[number]

export function isAppealReason(value: string): value is AppealReason {
  return (APPEAL_REASONS as readonly string[]).includes(value)
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function appealDeadlineEnd(assessmentDate: string): string {
  const m = ISO_DATE_RE.exec(assessmentDate)
  if (m === null) throw new RangeError(`einspruchsfristEnde: "${assessmentDate}" is not an ISO yyyy-mm-dd date`)
  const year = Number(m[1]!)
  const month = Number(m[2]!)
  const tag = Number(m[3]!)
  const targetYear = month === 12 ? year + 1 : year
  const targetMonth = month === 12 ? 1 : month + 1
  const targetDay = Math.min(tag, daysInMonth(targetYear, targetMonth))
  const mm = String(targetMonth).padStart(2, '0')
  const tt = String(targetDay).padStart(2, '0')
  return `${targetYear}-${mm}-${tt}`
}

function daysSince(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

export function remainingAppealDays(assessmentDate: string, today: string): number {
  const end = daysSince(appealDeadlineEnd(assessmentDate))
  const start = daysSince(today)
  return end - start
}

export const ASSESSMENT_UNCLEAR = 'unklar'

export function isValidAssessmentAmount(field: AssessmentField, value: number): boolean {
  if (!Number.isInteger(value)) return false
  const def = ASSESSMENT_FIELDS.find((f) => f.id === field)
  return def?.signed === true ? Number.isFinite(value) : value >= 0
}

export function serializeAssessmentField(field: AssessmentField, value: number | null | typeof ASSESSMENT_UNCLEAR): string | null {
  if (value === null) return null
  if (value === ASSESSMENT_UNCLEAR) return ASSESSMENT_UNCLEAR
  if (!isValidAssessmentAmount(field, value)) {
    throw new RangeError(`bescheid: erfasst value for "${field}" is not a valid whole-euro amount`)
  }
  return String(value)
}

export function deserializeAssessmentField(field: AssessmentField, value: string | null): number | null | typeof ASSESSMENT_UNCLEAR {
  if (value === null) return null
  if (value === ASSESSMENT_UNCLEAR) return ASSESSMENT_UNCLEAR
  const rawValue = Number(value)
  if (!isValidAssessmentAmount(field, rawValue)) {
    throw new Error(`bescheid: stored value "${value}" for "${field}" is neither offen, unklar, nor a valid amount`)
  }
  return rawValue
}
