import type { KapitalFeldId } from '@steuereule/core'

export interface KapitalRecord {
  userId: string
  steuerjahr: number
  kapitalertraege: string | null
  sparerPauschbetrag: string | null
  kapitalertragsteuer: string | null
  solidaritaetszuschlag: string | null
  kirchensteuer: string | null
  inhaber?: KapitalInhaber | null
}

/** ADR-0054: whose depot — Person A, Person B, or a joint account. */
export type KapitalInhaber = 'A' | 'B' | 'gemeinsam'

export const KAPITAL_REPOSITORY = Symbol('KAPITAL_REPOSITORY')

/** The persistence seam for the Kapital guided mask. */
export interface KapitalRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord>
  setInhaber(userId: string, steuerjahr: number, inhaber: KapitalInhaber): Promise<KapitalRecord>
}
