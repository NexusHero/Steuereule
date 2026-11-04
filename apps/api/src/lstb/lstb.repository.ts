import type { LstbFeldId } from '@steuereule/core'

export interface LstbRecord {
  userId: string
  steuerjahr: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}

export const LSTB_REPOSITORY = Symbol('LSTB_REPOSITORY')

/** The persistence seam for the LStB guided mask. */
export interface LstbRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<LstbRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, wert: string | null): Promise<LstbRecord>
}
