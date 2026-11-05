import type { WageTaxCertificateFieldId } from '@steuereule/core'

export interface LstbRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}
export type EmploymentTaxRecord = LstbRecord

export const LSTB_REPOSITORY = Symbol('LSTB_REPOSITORY')
export const EMPLOYMENT_TAX_REPOSITORY = LSTB_REPOSITORY

/** The persistence seam for the LStB / wage tax certificate guided mask. */
export interface LstbRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<LstbRecord | null>
  setField?(userId: string, taxYear: number, field: WageTaxCertificateFieldId, value: string | null): Promise<LstbRecord>
  setFeld(userId: string, steuerjahr: number, feld: WageTaxCertificateFieldId, wert: string | null): Promise<LstbRecord>
}
export type EmploymentTaxRepository = LstbRepository
