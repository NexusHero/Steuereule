import type { WageTaxCertificateFieldId } from '@steuereule/core'

export interface WageTaxCertificateRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}

export const WAGE_TAX_CERTIFICATE_REPOSITORY = Symbol('LSTB_REPOSITORY')

/** The persistence seam for the LStB / wage tax certificate guided mask. */
export interface WageTaxCertificateRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<WageTaxCertificateRecord | null>
  setField(userId: string, steuerjahr: number, field: WageTaxCertificateFieldId, value: string | null): Promise<WageTaxCertificateRecord>
}
