import type { AssessmentField, BescheidStatus } from '@steuereule/core'

export type AssessmentFields = Record<AssessmentField | AssessmentField, string | null>

export interface AssessmentRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  status: BescheidStatus
  bescheiddatum: string | null
  noticeDate?: string | null
  einspruchGrund: string | null
  appealReason?: string | null
  felder: AssessmentFields
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY')

/** The persistence seam for the tax assessment notice (Steuerbescheid). */
export interface AssessmentRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null>
  setField?(userId: string, taxYear: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord>
  setFeld(userId: string, steuerjahr: number, feld: AssessmentField, wert: string | null): Promise<AssessmentRecord>
  setDate?(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord>
  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<AssessmentRecord>
  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<AssessmentRecord>
  setAppeal?(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord>
  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<AssessmentRecord>
}
