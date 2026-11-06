import type { AssessmentField, AssessmentStatus } from '@steuereule/core'

export type AssessmentFields = Record<AssessmentField | AssessmentField, string | null>

export interface AssessmentRecord {
  userId: string
  taxYear: number
  status: AssessmentStatus
  assessmentDate: string | null
  appealReason: string | null
  fields: AssessmentFields
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY')

/** The persistence seam for the tax assessment notice (Steuerbescheid). */
export interface AssessmentRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<AssessmentRecord | null>
  setField(userId: string, taxYear: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord>
  setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord>
  setStatus(userId: string, taxYear: number, status: AssessmentStatus): Promise<AssessmentRecord>
  setAppeal(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord>
}
