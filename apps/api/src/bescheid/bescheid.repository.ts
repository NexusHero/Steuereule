import type { AssessmentField, BescheidStatus } from '@steuereule/core'

export type AssessmentFields = Record<AssessmentField | AssessmentField, string | null>

export interface AssessmentRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  status: BescheidStatus
  bescheiddatum: string | null
  einspruchGrund: string | null
  felder: AssessmentFields
}

export const ASSESSMENT_REPOSITORY = Symbol('ASSESSMENT_REPOSITORY')

/** The persistence seam for the tax assessment notice (Steuerbescheid). */
export interface AssessmentRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: AssessmentField, wert: string | null): Promise<AssessmentRecord>
  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<AssessmentRecord>
  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<AssessmentRecord>
  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<AssessmentRecord>
}
