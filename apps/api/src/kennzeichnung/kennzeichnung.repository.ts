// The persistence seam for the Kennzeichnungs-Schicht (ADR-0049, generalised by ADR-0052 §6/§7).
// Mask services depend only on this interface (to drop a marker when the user writes a field), so
// importing it never pulls the mask repositories in — the Bestätigung module owns those.
import type { Anlage, Kennzeichnung } from '@steuereule/core'

/** A stored Kennzeichnung — the core shape without `wert` (the value lives in its mask). */
export type KennzeichnungRecord = Omit<Kennzeichnung, 'wert'> & {
  readonly userId: string
  readonly steuerjahr: number
}

export const KENNZEICHNUNG_REPOSITORY = Symbol('KENNZEICHNUNG_REPOSITORY')

export interface KennzeichnungRepository {
  /** All Kennzeichnungen of the given years (a tax year plus JAHRESUNABHAENGIG), by key. */
  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<KennzeichnungRecord[]>
  find(userId: string, steuerjahr: number, key: string): Promise<KennzeichnungRecord | null>
  /** Create or replace the Kennzeichnung of one field. */
  speichere(userId: string, steuerjahr: number, kennzeichnung: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord>
  /** The user wrote these fields themselves — their markers (and open proposals) go. */
  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number>
  /** Confirm every unconfirmed field of one Anlage in the given years; returns how many. */
  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Anlage): Promise<number>
}
