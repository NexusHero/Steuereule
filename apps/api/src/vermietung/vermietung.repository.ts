import type { RentalFieldId } from '@steuereule/core'

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
  /** Anlage V Z. 20: laufende Umlagen / Nebenkosten received (whole euros). */
  umlagen?: string | null
  /** Anlage V Z. 46/48: Schuldzinsen (whole euros). */
  schuldzinsen?: string | null
  /** Number of flats let in this building (Anlage V Z. 13). */
  einheiten?: string | null
  /** Person A's share in percent; the rest is Person B's (Anlage V Z. 86, ADR-0054). */
  anteilA?: string | null
}

export const RENTAL_REPOSITORY = Symbol('RENTAL_REPOSITORY')

/** The persistence seam for the Vermietung guided mask. */
export interface RentalRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<RentalObjectRecord[]>
  create(userId: string, steuerjahr: number): Promise<RentalObjectRecord>
  setField(userId: string, steuerjahr: number, propertyId: string, field: RentalFieldId, value: string | null): Promise<RentalObjectRecord | null>
  setAddress(
    userId: string,
    steuerjahr: number,
    propertyId: string,
    address: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null; umlagen?: string | null; schuldzinsen?: string | null; einheiten?: string | null; anteilA?: string | null },
  ): Promise<RentalObjectRecord | null>
}
