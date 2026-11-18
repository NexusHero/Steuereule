import type { AssessmentField, AssessmentPositionId, AssessmentStatus } from '@steuereule/core'

export type AssessmentFields = Record<AssessmentField, string | null>

/** A field the Bescheid row stores: one of the five original figures or a Besteuerungsgrundlage (ADR-0098). */
export type AssessmentStoredField = AssessmentField | AssessmentPositionId

export interface AssessmentRecord {
  userId: string
  taxYear: number
  status: AssessmentStatus
  assessmentDate: string | null
  appealReason: string | null
  fields: AssessmentFields
  /** The positions beyond the five fields (ADR-0098 §8); absent = not read. */
  positions?: Partial<Record<AssessmentPositionId, string | null>>
  /** The Finanzamt's Erläuterungen as printed, one paragraph per line. */
  explanations?: string | null
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY')

/** The persistence seam for the tax assessment notice (Steuerbescheid). */
export interface AssessmentRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<AssessmentRecord | null>
  /** Every Bescheid of the account, for the Verlauf (ADR-0098); userId-scoped (ADR-0007). */
  listForUser(userId: string): Promise<AssessmentRecord[]>
  setField(userId: string, taxYear: number, field: AssessmentStoredField, value: string | null): Promise<AssessmentRecord>
  setExplanations(userId: string, taxYear: number, text: string | null): Promise<AssessmentRecord>
  setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord>
  setStatus(userId: string, taxYear: number, status: AssessmentStatus): Promise<AssessmentRecord>
  setAppeal(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord>
  /**
   * The Eckjahr (ADR-0098 §4): a Bescheid taken over for a year without a declaration in the app makes
   * that year `extern-erledigt` (ADR-0039), with no interview. A year the app already keeps is left as
   * it is. True when the year was created.
   */
  recordExternalYear(userId: string, taxYear: number): Promise<boolean>
  /** Whether the app keeps a declaration for the year (a tax year or interview answers). */
  hasDeclaration(userId: string, taxYear: number): Promise<boolean>
}

/** The stored value of a position: the original column where one holds it, else its own. */
export function storedPosition(record: AssessmentRecord | null, position: AssessmentPositionId): string | null {
  if (record === null) return null
  if (position in record.fields) return record.fields[position as AssessmentField]
  return record.positions?.[position] ?? null
}
