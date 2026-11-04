import type { Belegart } from '@steuereule/core'

export interface BelegRecord {
  id: string
  userId: string
  dateiname: string
  art?: Belegart
  belegdatum?: string
  zahlungsdatum?: string
  steuerjahr: number | null
  vorschlagVerworfen: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateBelegData {
  dateiname: string
  art?: Belegart
  belegdatum?: string
  zahlungsdatum?: string
}

/** The one assignment write: confirm a year, optionally dismissing a contradicting suggestion. */
export interface SetZuordnungData {
  steuerjahr: number
  vorschlagVerworfen: boolean
}

export const BELEG_REPOSITORY = Symbol('BELEG_REPOSITORY')

/** The persistence seam for Beleg. */
export interface BelegRepository {
  findAllForUser(userId: string): Promise<BelegRecord[]>
  findByIdForUser(userId: string, id: string): Promise<BelegRecord | null>
  create(userId: string, data: CreateBelegData): Promise<BelegRecord>
  setZuordnung(userId: string, id: string, data: SetZuordnungData): Promise<BelegRecord | null>
}
