import type { CalculationStatus } from './berechnung'
import type { EmployeeFacts } from '../domains/employee'
import { GERMAN_STATES, publicHolidays, type HolidayRegion } from '../common/public-holidays'
import { incomeTax, isSupportedIncomeTaxYear, soliExemptionLimits, solidaritaetszuschlag, splittingTariff } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

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

/**
 * The three sums of the Bescheid against what the app computes for the open year. Since ADR-0098 it is
 * the comparable subset of the position diff: the same row rule, over the three buckets `berechne` has.
 */
export function reconcileAssessment(values: AssessmentValues, status: CalculationStatus): AssessmentComparison {
  const calculated: Partial<Record<AssessmentAmountField, number>> = {}
  for (const field of ASSESSMENT_COMPARABLE_FIELDS) calculated[field] = status[field]
  const deviations = comparePositions(ASSESSMENT_COMPARABLE_FIELDS, calculated, values)
    .filter((row) => row.status === 'deviation')
    .map((row) => ({ field: row.position, assessment: row.assessed!, calculated: row.declared!, difference: row.difference! }))
  return { deviations, calculationIncomplete: status.kind === 'offen' }
}

/** One compared position: `not_read` when the Bescheid side is missing, never 0 and never a deviation. */
export interface ComparedPosition<P extends string> {
  readonly position: P
  readonly declared: number | null
  readonly assessed: number | null
  readonly difference: number | null
  readonly status: 'same' | 'deviation' | 'not_read' | 'not_declared'
}

/** The row rule both comparisons share; a position neither side has is left out. */
function comparePositions<P extends string>(
  positions: readonly P[],
  declared: Partial<Record<P, number>>,
  assessed: Partial<Record<P, number | 'not_read'>>,
): ComparedPosition<P>[] {
  const rows: ComparedPosition<P>[] = []
  for (const position of positions) {
    const d: number | undefined = declared[position]
    const a: number | 'not_read' | undefined = assessed[position]
    if (d === undefined && a === undefined) continue
    if (a === undefined || a === 'not_read') {
      rows.push({ position, declared: d ?? null, assessed: null, difference: null, status: 'not_read' })
    } else if (d === undefined) {
      rows.push({ position, declared: null, assessed: a, difference: null, status: 'not_declared' })
    } else {
      rows.push({ position, declared: d, assessed: a, difference: a - d, status: a === d ? 'same' : 'deviation' })
    }
  }
  return rows
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

/** How an Einspruch ended (ADR-0099 §8); `offen` while the Finanzamt has not decided. */
export const APPEAL_OUTCOMES = ['offen', 'stattgegeben', 'teilweise', 'abgelehnt', 'zurueckgenommen'] as const
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number]

export function isAppealOutcome(value: string): value is AppealOutcome {
  return (APPEAL_OUTCOMES as readonly string[]).includes(value)
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const isoOf = (date: Date): string => date.toISOString().slice(0, 10)

function parseIso(value: string, what: string): Date {
  const m = ISO_DATE_RE.exec(value)
  if (m === null) throw new RangeError(`${what}: "${value}" is not an ISO yyyy-mm-dd date`)
  return new Date(Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)))
}

/** Holidays every German state keeps; without the user's state only these move a deadline. */
function holidaysOf(year: number, region: HolidayRegion | undefined): ReadonlySet<string> {
  if (region) return new Set(publicHolidays(year, region))
  const [first, ...rest] = GERMAN_STATES.map((state) => new Set(publicHolidays(year, state)))
  return new Set([...first!].filter((day) => rest.every((set) => set.has(day))))
}

/** The day itself, or the next one that is not a Saturday, Sunday or holiday (§ 108 Abs. 3 AO). */
export function nextWorkingDay(day: string, region?: HolidayRegion): string {
  const date = parseIso(day, 'nextWorkingDay')
  for (;;) {
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6 && !holidaysOf(date.getUTCFullYear(), region).has(isoOf(date))) return isoOf(date)
    date.setUTCDate(date.getUTCDate() + 1)
  }
}

/**
 * When a notice sent by post counts as received (§ 122 Abs. 2 Nr. 1 AO): the fourth day after it
 * was posted for notices posted from 2025 on, the third day before. The date on the notice is taken
 * as the day of posting, as advisers do. A deemed day on a weekend or holiday moves to the next
 * working day (BFH, settled case law; not checked against the wording of the law here).
 */
export function noticeReceivedOn(assessmentDate: string, region?: HolidayRegion): string {
  const date = parseIso(assessmentDate, 'noticeReceivedOn')
  date.setUTCDate(date.getUTCDate() + (assessmentDate >= '2025-01-01' ? 4 : 3))
  return nextWorkingDay(isoOf(date), region)
}

/**
 * The last day for an objection (§ 355 Abs. 1 AO): one month after the notice counts as received,
 * the same day number or the month's last day (§ 108 Abs. 1 AO, § 188 Abs. 2, 3 BGB), moved to the
 * next working day (§ 108 Abs. 3 AO). Without the state only nationwide holidays count, so the day
 * is never later than the real one.
 */
export function appealDeadlineEnd(assessmentDate: string, region?: HolidayRegion): string {
  const received = parseIso(noticeReceivedOn(assessmentDate, region), 'appealDeadlineEnd')
  const year = received.getUTCFullYear()
  const month = received.getUTCMonth() + 1
  const day = received.getUTCDate()
  const targetYear = month === 12 ? year + 1 : year
  const targetMonth = month === 12 ? 1 : month + 1
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return nextWorkingDay(`${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`, region)
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

// ---------------------------------------------------------------------------------------------
// ADR-0098 §8: the Besteuerungsgrundlagen of a Bescheid, position by position, against the
// version frozen at submission.
// ---------------------------------------------------------------------------------------------

/** The groups a Bescheid prints, in its order. */
export const ASSESSMENT_GROUPS = ['einkuenfte', 'werbungskostenA', 'werbungskostenB', 'vorsorge', 'steuer'] as const
export type AssessmentGroup = (typeof ASSESSMENT_GROUPS)[number]

/** What kind of position it is: the lessons catalogue and the refund model key on this. */
export type AssessmentPositionType =
  | 'bruttoarbeitslohn'
  | 'fahrtweg'
  | 'homeoffice'
  | 'arbeitsmittel'
  | 'sonstigeWerbungskosten'
  | 'werbungskosten'
  | 'vorsorgeaufwand'
  | 'sonderausgaben'
  | 'aussergewoehnlicheBelastungen'
  | 'steuerermaessigung35a'
  | 'zuVersteuerndesEinkommen'
  | 'festgesetzteSteuer'
  | 'solidaritaetszuschlag'
  | 'kirchensteuer'
  | 'anrechnung'
  | 'erstattung'

export interface AssessmentPositionDef {
  readonly id: string
  readonly type: AssessmentPositionType
  readonly group: AssessmentGroup
  /** Whose position it is in a joint return; null for the household's. */
  readonly person: 'A' | 'B' | null
  /** `followOn` positions follow from the own ones (ADR-0098 §8) and never count as a deviation. */
  readonly role: 'own' | 'followOn'
  /** Only the Abschlusszahlung may be negative (Nachzahlung). */
  readonly signed: boolean
  /** The label the Bescheid-Abgleich shows (user-facing copy). */
  readonly label: string
}

const personPositions = <P extends 'A' | 'B'>(person: P) =>
  [
    { id: `fahrtweg${person}`, type: 'fahrtweg', group: `werbungskosten${person}`, person, role: 'own', signed: false, label: 'Fahrtweg (Entfernungspauschale)' },
    { id: `homeoffice${person}`, type: 'homeoffice', group: `werbungskosten${person}`, person, role: 'own', signed: false, label: 'Homeoffice-Pauschale' },
    { id: `arbeitsmittel${person}`, type: 'arbeitsmittel', group: `werbungskosten${person}`, person, role: 'own', signed: false, label: 'Arbeitsmittel' },
    { id: `sonstigeWerbungskosten${person}`, type: 'sonstigeWerbungskosten', group: `werbungskosten${person}`, person, role: 'own', signed: false, label: 'Sonstige Werbungskosten' },
    { id: `werbungskosten${person}`, type: 'werbungskosten', group: `werbungskosten${person}`, person, role: 'followOn', signed: false, label: `Summe Werbungskosten ${person}` },
  ] as const satisfies readonly AssessmentPositionDef[]

/** Every position a Bescheid shows (ADR-0098 §8), in form order. */
export const ASSESSMENT_POSITIONS = [
  { id: 'bruttoarbeitslohnA', type: 'bruttoarbeitslohn', group: 'einkuenfte', person: 'A', role: 'own', signed: false, label: 'Bruttoarbeitslohn · Person A' },
  { id: 'bruttoarbeitslohnB', type: 'bruttoarbeitslohn', group: 'einkuenfte', person: 'B', role: 'own', signed: false, label: 'Bruttoarbeitslohn · Person B' },
  ...personPositions('A'),
  ...personPositions('B'),
  { id: 'vorsorgeaufwand', type: 'vorsorgeaufwand', group: 'vorsorge', person: null, role: 'own', signed: false, label: 'Vorsorgeaufwendungen' },
  { id: 'sonderausgaben', type: 'sonderausgaben', group: 'vorsorge', person: null, role: 'own', signed: false, label: 'Sonderausgaben' },
  { id: 'aussergewoehnlicheBelastungen', type: 'aussergewoehnlicheBelastungen', group: 'vorsorge', person: null, role: 'own', signed: false, label: 'Außergewöhnliche Belastungen' },
  { id: 'zuVersteuerndesEinkommen', type: 'zuVersteuerndesEinkommen', group: 'steuer', person: null, role: 'followOn', signed: false, label: 'Zu versteuerndes Einkommen' },
  { id: 'festgesetzteSteuer', type: 'festgesetzteSteuer', group: 'steuer', person: null, role: 'followOn', signed: false, label: 'Einkommensteuer' },
  { id: 'steuerermaessigung35a', type: 'steuerermaessigung35a', group: 'steuer', person: null, role: 'own', signed: false, label: 'Steuerermäßigung § 35a EStG' },
  { id: 'solidaritaetszuschlag', type: 'solidaritaetszuschlag', group: 'steuer', person: null, role: 'followOn', signed: false, label: 'Solidaritätszuschlag' },
  { id: 'kirchensteuer', type: 'kirchensteuer', group: 'steuer', person: null, role: 'followOn', signed: false, label: 'Kirchensteuer' },
  { id: 'anrechnung', type: 'anrechnung', group: 'steuer', person: null, role: 'own', signed: false, label: 'Einbehaltene Lohnsteuer und anrechenbare Steuern' },
  { id: 'erstattung', type: 'erstattung', group: 'steuer', person: null, role: 'followOn', signed: true, label: 'Erstattung' },
] as const satisfies readonly AssessmentPositionDef[]

export type AssessmentPositionId = (typeof ASSESSMENT_POSITIONS)[number]['id']
export const ASSESSMENT_POSITION_IDS: readonly AssessmentPositionId[] = ASSESSMENT_POSITIONS.map((p) => p.id)

/** The positions the four original Bescheid fields already hold: one column each, not two. */
export const ASSESSMENT_NEW_POSITION_IDS: readonly AssessmentPositionId[] = ASSESSMENT_POSITION_IDS.filter(
  (id) => !(ASSESSMENT_FIELD_IDS as readonly string[]).includes(id),
)

const POSITION_BY_ID: ReadonlyMap<string, AssessmentPositionDef> = new Map(ASSESSMENT_POSITIONS.map((p) => [p.id, p]))

export function isAssessmentPositionId(value: string): value is AssessmentPositionId {
  return POSITION_BY_ID.has(value)
}

export function assessmentPosition(id: AssessmentPositionId): AssessmentPositionDef {
  return POSITION_BY_ID.get(id)!
}

/** A whole-euro amount for a position; only the Abschlusszahlung may be negative. */
export function isValidAssessmentPositionAmount(position: AssessmentPositionId, value: number): boolean {
  if (!Number.isInteger(value)) return false
  return assessmentPosition(position).signed ? Number.isFinite(value) : value >= 0
}

/** Declared or assessed amounts per position. */
export type AssessmentPositionValues = Partial<Record<AssessmentPositionId, number>>

/** One explanation the Finanzamt printed (Erläuterungen), quoted, tied to a position where it names one. */
export interface AssessmentExplanation {
  readonly position: AssessmentPositionId | null
  readonly text: string
}

/** The left side: the version frozen at submission (ADR-0098 §8), not today's answers. */
export interface FiledReturn {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  readonly positions: AssessmentPositionValues
}

/** The right side: what the Bescheid shows; a position missing or `not_read` was not readable. */
export interface AssessedReturn {
  readonly positions: Partial<Record<AssessmentPositionId, number | 'not_read'>>
  readonly explanations?: readonly AssessmentExplanation[] | undefined
}

export interface AssessmentDiffRow extends ComparedPosition<AssessmentPositionId> {
  readonly label: string
  readonly role: 'own' | 'followOn'
  readonly person: 'A' | 'B' | null
  /** The Finanzamt's explanation for this position, quoted from the Bescheid. */
  readonly explanation: string | null
}

export interface AssessmentOwnDeviation extends AssessmentDiffRow {
  /** Effect on the refund of setting only this position to the Bescheid's value; null when not computable. */
  readonly refundEffect: number | null
}

export interface AssessmentDiff {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  /** Every position in form order, grouped as the Bescheid groups them. */
  readonly groups: ReadonlyArray<{ readonly group: AssessmentGroup; readonly rows: readonly AssessmentDiffRow[] }>
  /** What the Finanzamt changed, the largest effect on the refund first. */
  readonly ownDeviations: readonly AssessmentOwnDeviation[]
  /** Summe Werbungskosten → zvE → Steuer → Erstattung, as one chain: only the links that moved. */
  readonly followOnChain: ReadonlyArray<{ readonly position: AssessmentPositionId; readonly label: string; readonly difference: number }>
  /** Assessed minus declared refund; null when either side is missing. */
  readonly totalRefundEffect: number | null
  /** Sum of the single effects; null when one of them is not computable. */
  readonly singleEffectsSum: number | null
  /** The tax is not linear: the single effects need not add up to the total effect (ADR-0098 §8). */
  readonly effectsDifferFromTotal: boolean
  /** Explanations the Bescheid prints without naming a position. */
  readonly generalExplanations: readonly string[]
  readonly counts: { readonly positions: number; readonly same: number; readonly deviations: number; readonly notRead: number }
}

const FOLLOW_ON_ORDER: readonly AssessmentPositionId[] = [
  'werbungskostenA',
  'werbungskostenB',
  'zuVersteuerndesEinkommen',
  'festgesetzteSteuer',
  'solidaritaetszuschlag',
  'kirchensteuer',
  'erstattung',
]

/**
 * Erklärung ↔ Bescheid, position by position (ADR-0098 §8). Own deviations are separated from the
 * follow-on changes; the effect of each own deviation on the refund is computed by setting only that
 * position to the Bescheid's value and running the change through the tariff of the core.
 */
export function diffAssessment(filed: FiledReturn, assessed: AssessedReturn): AssessmentDiff {
  const explanationOf = new Map<string, string>()
  const general: string[] = []
  for (const e of assessed.explanations ?? []) {
    if (e.position === null) general.push(e.text)
    else explanationOf.set(e.position, [explanationOf.get(e.position), e.text].filter(Boolean).join(' '))
  }
  const joint = filed.filingType === 'zusammen'
  const positions = ASSESSMENT_POSITION_IDS.filter((id) => joint || assessmentPosition(id).person !== 'B')
  const rows: AssessmentDiffRow[] = comparePositions(positions, filed.positions, assessed.positions).map((row) => {
    const def = assessmentPosition(row.position)
    return { ...row, label: def.label, role: def.role, person: def.person, explanation: explanationOf.get(row.position) ?? null }
  })

  const groups = ASSESSMENT_GROUPS.map((group) => ({ group, rows: rows.filter((r) => assessmentPosition(r.position).group === group) })).filter(
    (g) => g.rows.length > 0,
  )
  const ownDeviations: AssessmentOwnDeviation[] = rows
    .filter((r) => r.role === 'own' && r.status === 'deviation')
    .map((r) => ({ ...r, refundEffect: singleRefundEffect(filed, r.position, r.assessed!) }))
    .sort((x, y) => Math.abs(y.refundEffect ?? 0) - Math.abs(x.refundEffect ?? 0) || Math.abs(y.difference!) - Math.abs(x.difference!))
  const followOnChain = FOLLOW_ON_ORDER.flatMap((id) => {
    const row = rows.find((r) => r.position === id && r.status === 'deviation')
    return row ? [{ position: id, label: row.label, difference: row.difference! }] : []
  })
  const refundRow = rows.find((r) => r.position === 'erstattung')
  const totalRefundEffect = refundRow?.difference ?? null
  const effects = ownDeviations.map((d) => d.refundEffect)
  const singleEffectsSum = effects.some((e) => e === null) ? null : effects.reduce<number>((sum, e) => sum + e!, 0)

  return {
    year: filed.year,
    filingType: filed.filingType,
    groups,
    ownDeviations,
    followOnChain,
    totalRefundEffect,
    singleEffectsSum,
    effectsDifferFromTotal: totalRefundEffect !== null && singleEffectsSum !== null && ownDeviations.length > 0 && singleEffectsSum !== totalRefundEffect,
    generalExplanations: general,
    counts: {
      positions: rows.length,
      same: rows.filter((r) => r.status === 'same').length,
      deviations: ownDeviations.length,
      notRead: rows.filter((r) => r.status === 'not_read').length,
    },
  }
}

/** Arbeitnehmer-Pauschbetrag (§ 9a Satz 1 Nr. 1 Buchst. a EStG) of years before the core's tariff years. */
const EARLIER_EMPLOYEE_LUMP_SUMS: Readonly<Record<number, number>> = { 2019: 1000, 2020: 1000, 2021: 1000 }

/** The year's Arbeitnehmer-Pauschbetrag, or null for a year the app knows nothing about. */
export function employeeLumpSum(year: number): number | null {
  if (isSupportedIncomeTaxYear(year)) return getTaxYearParameters(year).lumpSums.employee
  return EARLIER_EMPLOYEE_LUMP_SUMS[year] ?? null
}

const WORK_EXPENSE_PARTS = ['fahrtweg', 'homeoffice', 'arbeitsmittel', 'sonstigeWerbungskosten'] as const

/** A person's Werbungskosten: the sum of the parts where any is declared, else the declared sum. */
function workExpensesOf(values: AssessmentPositionValues, person: 'A' | 'B'): number {
  const parts = WORK_EXPENSE_PARTS.map((part) => values[`${part}${person}` as AssessmentPositionId])
  if (parts.some((v) => v !== undefined)) return parts.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  return values[`werbungskosten${person}` as AssessmentPositionId] ?? 0
}

/** A person's wage income: gross wage less the Werbungskosten, at least the lump sum (§ 9a EStG). */
function wageIncomeOf(values: AssessmentPositionValues, person: 'A' | 'B', lumpSum: number): number {
  const gross = values[`bruttoarbeitslohn${person}` as AssessmentPositionId] ?? 0
  return gross - Math.max(workExpensesOf(values, person), lumpSum)
}

/**
 * The refund when only `position` takes the Bescheid's value. The change is carried from the declared
 * zvE and tax, so what the positions do not show (child allowances, the progression clause) stays as
 * declared. Church tax moves with the income tax at the rate the declaration implies.
 */
function singleRefundEffect(filed: FiledReturn, position: AssessmentPositionId, assessedValue: number): number | null {
  const base = filed.positions
  const zvE = base.zuVersteuerndesEinkommen
  const tax = base.festgesetzteSteuer
  const refund = base.erstattung
  const lumpSum = employeeLumpSum(filed.year)
  if (zvE === undefined || tax === undefined || refund === undefined || lumpSum === null || !isSupportedIncomeTaxYear(filed.year)) return null
  const changed: AssessmentPositionValues = { ...base, [position]: assessedValue }
  const persons: readonly ('A' | 'B')[] = filed.filingType === 'zusammen' ? ['A', 'B'] : ['A']
  const incomeDelta = persons.reduce((sum, p) => sum + wageIncomeOf(changed, p, lumpSum) - wageIncomeOf(base, p, lumpSum), 0)
  const deduction = (v: AssessmentPositionValues) => (v.vorsorgeaufwand ?? 0) + (v.sonderausgaben ?? 0) + (v.aussergewoehnlicheBelastungen ?? 0)
  const newZvE = Math.max(0, zvE + incomeDelta - (deduction(changed) - deduction(base)))
  const tariff = (value: number) => (filed.filingType === 'zusammen' ? splittingTariff(value, 0, filed.year) : incomeTax(value, filed.year))
  const reductionDelta = (changed.steuerermaessigung35a ?? 0) - (base.steuerermaessigung35a ?? 0)
  const taxDelta = tariff(newZvE) - tariff(zvE) - reductionDelta
  const limits = soliExemptionLimits(filed.year)
  const limit = filed.filingType === 'zusammen' ? limits.joint : limits.single
  const soliDelta = solidaritaetszuschlag(Math.max(0, tax + taxDelta), limit) - solidaritaetszuschlag(tax, limit)
  const churchRate = tax > 0 && (base.kirchensteuer ?? 0) > 0 ? ((base.kirchensteuer ?? 0) / tax >= 0.085 ? 0.09 : 0.08) : 0
  const churchDelta = Math.round(taxDelta * churchRate)
  const creditDelta = (changed.anrechnung ?? 0) - (base.anrechnung ?? 0)
  return Math.round(creditDelta - taxDelta - soliDelta - churchDelta)
}

/** Where a lesson shows again in the next open year (ADR-0098 §8, „Fürs nächste Mal“). */
export interface LessonMask {
  /** A mask id of the interview layer's `Screen` (the engine does not import that layer). */
  readonly screen: 'commute' | 'interview'
  readonly field: string
  /** The mask's name as the app shows it (user-facing copy). */
  readonly label: string
}

/** The fixed hint catalogue per position type; a type without an entry gets only the first two parts. */
const LESSON_CATALOGUE: Partial<Record<AssessmentPositionType, { readonly hint: string; readonly mask: LessonMask }>> = {
  homeoffice: {
    hint: 'Homeoffice-Tage laufend festhalten, zum Beispiel im Kalender oder mit einer Bescheinigung des Arbeitgebers.',
    mask: { screen: 'commute', field: 'homeOfficeDays', label: 'Homeoffice' },
  },
  arbeitsmittel: {
    hint: 'Den beruflichen Anteil gemischt genutzter Geräte belegen; ohne Nachweis erkennt das Finanzamt oft nur die Hälfte an.',
    mask: { screen: 'commute', field: 'workEquipmentEur', label: 'Arbeitsmittel' },
  },
  fahrtweg: {
    hint: 'Entfernung und Arbeitstage belegen können; das Finanzamt rechnet mit der kürzesten Straßenverbindung.',
    mask: { screen: 'commute', field: 'oneWayKm', label: 'Arbeitsweg' },
  },
  sonstigeWerbungskosten: {
    hint: 'Zu jeder sonstigen Ausgabe den beruflichen Anlass notieren und den Beleg aufheben.',
    mask: { screen: 'commute', field: 'otherWorkExpensesEur', label: 'Weitere Werbungskosten' },
  },
  sonderausgaben: {
    hint: 'Für jede Spende die Zuwendungsbestätigung aufheben; ab 300 € genügt der Kontoauszug nicht.',
    mask: { screen: 'interview', field: 'spenden-betrag', label: 'Spenden' },
  },
  aussergewoehnlicheBelastungen: {
    hint: 'Nur selbst getragene Kosten ansetzen und Rezepte und Erstattungen der Krankenkasse aufheben.',
    mask: { screen: 'interview', field: 'gesundheit-betrag', label: 'Krankheitskosten' },
  },
  steuerermaessigung35a: {
    hint: 'Nur den Lohnanteil der Rechnung ansetzen und unbar zahlen; Material zählt nicht.',
    mask: { screen: 'interview', field: 'haushalt-handwerker-betrag', label: 'Handwerker' },
  },
}

/** What the next year declares for the positions, from its frozen filing or, not yet filed, today's answers. */
export interface NextYearDeclaration {
  readonly year: number
  readonly source: 'filed' | 'answers'
  readonly positions: AssessmentPositionValues
}

export interface AssessmentLesson {
  readonly position: AssessmentPositionId
  readonly label: string
  readonly person: 'A' | 'B' | null
  /** What the Bescheid recognised against what was declared. */
  readonly recognised: { readonly declared: number; readonly assessed: number; readonly difference: number }
  /** The next year's declaration of the same position; never an amount for its pending Bescheid. */
  readonly nextYear: {
    readonly year: number
    readonly source: 'filed' | 'answers'
    readonly declared: number | null
    /** The next year again declares more than this Bescheid recognised; null when it declares nothing. */
    readonly declaredAboveRecognised: boolean | null
  } | null
  readonly hint: string | null
  readonly mask: LessonMask | null
}

/**
 * „Fürs nächste Mal“ (ADR-0098 §8): per own deviation what was recognised, whether the next year
 * declared it the same way again, and a hint from the fixed catalogue. No free text, no forecast.
 */
export function assessmentLessons(diff: AssessmentDiff, nextYear: NextYearDeclaration | null): AssessmentLesson[] {
  return diff.ownDeviations.map((d) => {
    const catalogue = LESSON_CATALOGUE[assessmentPosition(d.position).type]
    const next = nextYear?.positions[d.position]
    return {
      position: d.position,
      label: d.label,
      person: d.person,
      recognised: { declared: d.declared!, assessed: d.assessed!, difference: d.difference! },
      nextYear:
        nextYear === null
          ? null
          : { year: nextYear.year, source: nextYear.source, declared: next ?? null, declaredAboveRecognised: next === undefined ? null : next > d.assessed! },
      hint: catalogue?.hint ?? null,
      mask: catalogue?.mask ?? null,
    }
  })
}

/** The Einspruchsfrist as the app shows it: its end, the days left and whether it still runs. */
export interface AppealDeadline {
  readonly endsOn: string
  /** Whole days from today to the end; negative once it has passed. */
  readonly remainingDays: number
  readonly running: boolean
}

/**
 * The Einspruchsfrist of a Bescheid (§ 355 Abs. 1 AO): one month from the day it counts as received
 * (§ 122 Abs. 2 AO), its end moved to the next working day (§ 108 Abs. 3 AO). One function for the
 * Bescheidprüfung and the Verlauf, so both show the same day.
 */
export function appealDeadline(assessmentDate: string, today: string, region?: HolidayRegion): AppealDeadline {
  const endsOn = appealDeadlineEnd(assessmentDate, region)
  const remainingDays = daysSince(endsOn) - daysSince(today)
  return { endsOn, remainingDays, running: remainingDays >= 0 }
}
