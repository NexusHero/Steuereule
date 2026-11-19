import type { LstbSocialLine, WageTaxCertificateFieldId } from '@steuereule/core'

/** The LStB lines stored next to the three required fields (ADR-0093): Zeilen 22–27, 24c and 5. */
export type LstbLine = LstbSocialLine | 'solidaritaetszuschlag'
/** A partial update of the lines; `sozialversicherung` rides along when the app derives the sum. */
export type LstbLinePatch = Partial<Record<LstbLine | 'sozialversicherung', string | null>>

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
  /** Zeilen 23, 22, 25, 26, 27 and 24c, whole euros (ADR-0093). */
  rvArbeitnehmer?: string | null
  rvArbeitgeber?: string | null
  kvArbeitnehmer?: string | null
  pvArbeitnehmer?: string | null
  avArbeitnehmer?: string | null
  zuschussPv?: string | null
  /** Zeile 5, euros with cents as a decimal string. */
  solidaritaetszuschlag?: string | null
  /** The employer named on the certificate (ADR-0099 §8). */
  arbeitgeber?: string | null
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
  /** Zeilen 22–27, 24c and 5 (ADR-0093); only the lines named are written. */
  setLines(userId: string, taxYear: number, lines: LstbLinePatch): Promise<WageTaxCertificateRecord>
  /** The employer's name (ADR-0099 §8), optional like the church tax lines. */
  setEmployer(userId: string, taxYear: number, arbeitgeber: string | null): Promise<WageTaxCertificateRecord>
}
