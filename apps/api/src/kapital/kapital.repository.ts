import type { KapitalFeldId } from '@steuereule/core'

export interface KapitalRecord {
  userId: string
  steuerjahr: number
  kapitalertraege: string | null
  sparerPauschbetrag: string | null
  kapitalertragsteuer: string | null
  solidaritaetszuschlag: string | null
  kirchensteuer: string | null
}

export const KAPITAL_REPOSITORY = Symbol('KAPITAL_REPOSITORY')

/** The persistence seam for the Kapital guided mask. */
export interface KapitalRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord>
}
