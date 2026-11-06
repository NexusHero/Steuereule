import type { AssessmentField, AssessmentStatus } from '@steuereule/core'

export type AssessmentFields = Record<AssessmentField | AssessmentField, string | null>

export interface AssessmentRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  status: AssessmentStatus
  bescheiddatum: string | null
  einspruchGrund: string | null
  fields: AssessmentFields
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY')

/** The persistence seam for the tax assessment notice (Steuerbescheid). */
export interface AssessmentRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null>
  setField(userId: string, steuerjahr: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord>
  setDate(userId: string, steuerjahr: number, date: string | null): Promise<AssessmentRecord>
  setStatus(userId: string, steuerjahr: number, status: AssessmentStatus): Promise<AssessmentRecord>
  setAppeal(userId: string, steuerjahr: number, reason: string): Promise<AssessmentRecord>
}
