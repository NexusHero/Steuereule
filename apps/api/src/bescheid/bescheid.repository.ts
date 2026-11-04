import type { BescheidFeld, BescheidStatus } from '@steuereule/core'

export type BescheidFelder = Record<BescheidFeld, string | null>

export interface BescheidRecord {
  userId: string
  steuerjahr: number
  status: BescheidStatus
  bescheiddatum: string | null
  einspruchGrund: string | null
  felder: BescheidFelder
}

export const BESCHEID_REPOSITORY = Symbol('BESCHEID_REPOSITORY')

/** The persistence seam for the Steuerbescheid. */
export interface BescheidRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<BescheidRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: BescheidFeld, wert: string | null): Promise<BescheidRecord>
  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<BescheidRecord>
  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<BescheidRecord>
  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<BescheidRecord>
}
