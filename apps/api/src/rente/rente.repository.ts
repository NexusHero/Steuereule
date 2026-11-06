import type { PensionFieldId } from '@steuereule/core'

export interface PensionRecord {
  userId: string
  taxYear: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}

export const PENSION_REPOSITORY = Symbol('PENSION_REPOSITORY')

/** The persistence seam for the pension / Rentner guided mask. */
export interface PensionRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<PensionRecord | null>
  setField(userId: string, taxYear: number, field: PensionFieldId, value: string | null): Promise<PensionRecord>
  setPensionKind(userId: string, taxYear: number, kind: string | null): Promise<PensionRecord>
}
