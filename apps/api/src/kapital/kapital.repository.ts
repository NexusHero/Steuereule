import type { CapitalFieldId, KapitalFeldId } from '@steuereule/core'

export interface CapitalRecord {
  userId: string
  taxYear?: number
  steuerjahr: number
  kapitalertraege: string | null
  sparerPauschbetrag: string | null
  kapitalertragsteuer: string | null
  solidaritaetszuschlag: string | null
  kirchensteuer: string | null
  owner?: CapitalOwner | null
  inhaber?: CapitalOwner | null
}
export type KapitalRecord = CapitalRecord

/** ADR-0054: whose depot — Person A, Person B, or a joint account. */
export type CapitalOwner = 'A' | 'B' | 'gemeinsam'
export type KapitalInhaber = CapitalOwner

export const CAPITAL_REPOSITORY = Symbol('CAPITAL_REPOSITORY')
export const KAPITAL_REPOSITORY = CAPITAL_REPOSITORY

/** The persistence seam for the capital gains guided mask. */
export interface CapitalRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<CapitalRecord | null>
  setField?(userId: string, taxYear: number, field: CapitalFieldId, value: string | null): Promise<CapitalRecord>
  setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<CapitalRecord>
  setOwner?(userId: string, taxYear: number, owner: CapitalOwner): Promise<CapitalRecord>
  setInhaber(userId: string, steuerjahr: number, inhaber: KapitalInhaber): Promise<CapitalRecord>
}
export type KapitalRepository = CapitalRepository
