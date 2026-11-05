import type { Annex, Kennzeichnung } from '@steuereule/core'

export type ProvenanceRecord = Omit<Kennzeichnung, 'wert' | 'value'> & {
  readonly userId: string
  readonly steuerjahr: number
}
export const PROVENANCE_REPOSITORY = Symbol('PROVENANCE_REPOSITORY')

/** The persistence seam for the field provenance / confirmation layer. */
export interface ProvenanceRepository {
  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<ProvenanceRecord[]>
  find(userId: string, steuerjahr: number, key: string): Promise<ProvenanceRecord | null>
  speichere(userId: string, steuerjahr: number, kennzeichnung: Omit<Kennzeichnung, 'wert'>): Promise<ProvenanceRecord>
  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number>
  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Annex): Promise<number>
}
