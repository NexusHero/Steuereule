import type { Anlage, Kennzeichnung } from '@steuereule/core'

export type KennzeichnungRecord = Omit<Kennzeichnung, 'wert'> & {
  readonly userId: string
  readonly steuerjahr: number
}

export const KENNZEICHNUNG_REPOSITORY = Symbol('KENNZEICHNUNG_REPOSITORY')

/** The persistence seam for the Kennzeichnungs-Schicht. */
export interface KennzeichnungRepository {
  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<KennzeichnungRecord[]>
  find(userId: string, steuerjahr: number, key: string): Promise<KennzeichnungRecord | null>
  speichere(userId: string, steuerjahr: number, kennzeichnung: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord>
  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number>
  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Anlage): Promise<number>
}
