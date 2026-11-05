import type { PensionFieldId } from '@steuereule/core'

export interface PensionRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  rentenart: string | null
  pensionType?: string | null
  jahresbetrag: string | null
  annualAmount?: string | null
  rentenbeginnJahr: string | null
  startYear?: string | null
  alterBeiRentenbeginn: string | null
  ageAtStart?: string | null
}

export const PENSION_REPOSITORY = Symbol('PENSION_REPOSITORY')

/** The persistence seam for the pension / Rentner guided mask. */
export interface PensionRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<PensionRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: PensionFieldId, wert: string | null): Promise<PensionRecord>
  setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<PensionRecord>
}
