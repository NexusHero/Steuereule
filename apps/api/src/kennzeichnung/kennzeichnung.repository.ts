import type { Annex, Kennzeichnung } from '@steuereule/core'

export type ProvenanceRecord = Omit<Kennzeichnung, 'value' | 'value'> & {
  readonly userId: string
  readonly steuerjahr: number
}
export const PROVENANCE_REPOSITORY = Symbol('PROVENANCE_REPOSITORY')

/** The persistence seam for the field provenance / confirmation layer. */
export interface ProvenanceRepository {
  listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]>
  find(userId: string, steuerjahr: number, key: string): Promise<ProvenanceRecord | null>
  save(userId: string, steuerjahr: number, marking: Omit<Kennzeichnung, 'value'>): Promise<ProvenanceRecord>
  remove(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number>
  confirmAnnex(userId: string, taxYears: readonly number[], anlage: Annex): Promise<number>
}
