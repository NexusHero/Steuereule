import type { PensionFieldId } from '@steuereule/core'

export interface PensionRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}

export const PENSION_REPOSITORY = Symbol('PENSION_REPOSITORY')

/** The persistence seam for the pension / Rentner guided mask. */
export interface PensionRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<PensionRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: PensionFieldId, wert: string | null): Promise<PensionRecord>
  setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<PensionRecord>
}
