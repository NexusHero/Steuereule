import type { WageTaxCertificateFieldId } from '@steuereule/core'

export interface WageTaxCertificateRecord {
  userId: string
  taxYear: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
  /** LStB Zeile 6, whole euros as string; null/absent = not entered (ADR-0063). */
  kirchensteuer?: string | null
  /** LStB Zeile 7 (konfessionsverschiedene Ehe). */
  kirchensteuerEhegatte?: string | null
  /** LStB Zeile 24 a–c: tax-free employer subsidies to health and care insurance, whole euros (ADR-0090). */
  zuschuesseKvPv?: string | null
}

export interface WageTaxCertificateChurchTax {
  readonly kirchensteuer: string | null
  readonly kirchensteuerEhegatte: string | null
}

export const WAGE_TAX_CERTIFICATE_REPOSITORY = Symbol('LSTB_REPOSITORY')

/** The persistence seam for the LStB / wage tax certificate guided mask. */
export interface WageTaxCertificateRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<WageTaxCertificateRecord | null>
  setField(userId: string, taxYear: number, field: WageTaxCertificateFieldId, value: string | null): Promise<WageTaxCertificateRecord>
  /** Church tax lines (Zeilen 6 und 7), optional next to the three required fields. */
  setChurchTax(userId: string, taxYear: number, values: WageTaxCertificateChurchTax): Promise<WageTaxCertificateRecord>
  /** Zeile 24 a–c (ADR-0090), optional like the church tax lines. */
  setSubsidies(userId: string, taxYear: number, zuschuesseKvPv: string | null): Promise<WageTaxCertificateRecord>
}
