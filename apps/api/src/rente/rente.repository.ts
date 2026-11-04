import type { RentenFeldId } from '@steuereule/core'

export interface RenteRecord {
  userId: string
  steuerjahr: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}

export const RENTE_REPOSITORY = Symbol('RENTE_REPOSITORY')

/** The persistence seam for the Rentner guided mask. */
export interface RenteRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<RenteRecord | null>
  setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, wert: string | null): Promise<RenteRecord>
  setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<RenteRecord>
}
