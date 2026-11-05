import type { RentalFieldId, VermietungFeldId } from '@steuereule/core'

export interface RentalObjectRecord {
  id: string
  userId: string
  taxYear?: number
  steuerjahr: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  ort?: string | null
  wohnflaeche?: string | null
  afaWieVorjahr?: boolean | null
}
export type VermietungsobjektRecord = RentalObjectRecord

export const RENTAL_REPOSITORY = Symbol('RENTAL_REPOSITORY')
export const VERMIETUNG_REPOSITORY = RENTAL_REPOSITORY

/** The persistence seam for the Vermietung guided mask. */
export interface RentalRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<RentalObjectRecord[]>
  create(userId: string, steuerjahr: number): Promise<RentalObjectRecord>
  setField?(userId: string, taxYear: number, objectId: string, field: RentalFieldId, value: string | null): Promise<RentalObjectRecord | null>
  setFeld(userId: string, steuerjahr: number, objektId: string, feld: VermietungFeldId, wert: string | null): Promise<VermietungsobjektRecord | null>
  setAddress?(
    userId: string,
    taxYear: number,
    objectId: string,
    address: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null },
  ): Promise<RentalObjectRecord | null>
  setAdresse(
    userId: string,
    steuerjahr: number,
    objektId: string,
    adresse: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null },
  ): Promise<VermietungsobjektRecord | null>
}
export type VermietungRepository = RentalRepository
