import type { Annex, Anlage, Kennzeichnung } from '@steuereule/core'

export type KennzeichnungRecord = Omit<Kennzeichnung, 'wert' | 'value'> & {
  readonly userId: string
  readonly steuerjahr: number
  readonly taxYear?: number
}
export type ProvenanceRecord = KennzeichnungRecord

export const PROVENANCE_REPOSITORY = Symbol('PROVENANCE_REPOSITORY')
export const KENNZEICHNUNG_REPOSITORY = PROVENANCE_REPOSITORY

/** The persistence seam for the field provenance / confirmation layer. */
export interface ProvenanceRepository {
  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<ProvenanceRecord[]>
  find(userId: string, steuerjahr: number, key: string): Promise<ProvenanceRecord | null>
  save?(userId: string, taxYear: number, provenance: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord>
  speichere(userId: string, steuerjahr: number, kennzeichnung: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord>
  remove?(userId: string, taxYear: number, keys: readonly string[]): Promise<number>
  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number>
  confirmAnnex?(userId: string, taxYears: readonly number[], annex: Annex): Promise<number>
  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Anlage): Promise<number>
}
export type KennzeichnungRepository = ProvenanceRepository
