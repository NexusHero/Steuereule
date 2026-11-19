import type { RentalFieldId } from '@steuereule/core'

export interface RentalObjectRecord {
  id: string
  userId: string
  taxYear: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  city?: string | null
  livingArea?: string | null
  depreciationAsLastYear?: boolean | null
  /** Anlage V Z. 20: laufende Umlagen / Nebenkosten received (whole euros). */
  umlagen?: string | null
  /** Anlage V Z. 46/48: Schuldzinsen (whole euros). */
  schuldzinsen?: string | null
  /** Number of flats let in this building (Anlage V Z. 13). */
  einheiten?: string | null
  /** Person A's share in percent; the rest is Person B's (Anlage V Z. 86, ADR-0054). */
  anteilA?: string | null
  /** The object across the years (ADR-0099 §8); a fake's seed without one reads as the row's own id. */
  propertyKey?: string
  /** Date of purchase, ISO. */
  anschaffungsdatum?: string | null
  /** The year's Erhaltungsaufwand as stored JSON (core `serializeRentalRepairs`). */
  erhaltungsaufwand?: string | null
}

/** What a new row takes over from the object of an earlier year (the Jahresübernahme, ADR-0049). */
export interface RentalCarryOver {
  readonly propertyKey: string
  readonly anschaffungsdatum: string | null
}

/** The facts of an object beyond the four mask fields; on save, undefined keeps what is stored. */
export interface RentalAttributes {
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  city?: string | null
  livingArea?: string | null
  depreciationAsLastYear?: boolean | null
  umlagen?: string | null
  schuldzinsen?: string | null
  einheiten?: string | null
  anteilA?: string | null
  anschaffungsdatum?: string | null
  erhaltungsaufwand?: string | null
}

export const RENTAL_REPOSITORY = Symbol('RENTAL_REPOSITORY')

/** The persistence seam for the Vermietung guided mask. */
export interface RentalRepository {
  listForUserAndYear(userId: string, taxYear: number): Promise<RentalObjectRecord[]>
  /** A new object; `carry` makes it the same object as one of an earlier year. */
  create(userId: string, taxYear: number, carry?: RentalCarryOver): Promise<RentalObjectRecord>
  /** Every object of the account in every year, for the Verlauf (ADR-0099 §7); userId-scoped. */
  listForUser(userId: string): Promise<RentalObjectRecord[]>
  setField(userId: string, taxYear: number, propertyId: string, field: RentalFieldId, value: string | null): Promise<RentalObjectRecord | null>
  setAddress(userId: string, taxYear: number, propertyId: string, attributes: RentalAttributes): Promise<RentalObjectRecord | null>
}
