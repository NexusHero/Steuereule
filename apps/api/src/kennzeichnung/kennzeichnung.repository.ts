import type { Annex, Marking } from '@steuereule/core'

export type ProvenanceRecord = Omit<Marking, 'value' | 'value'> & {
  readonly userId: string
  readonly taxYear: number
}
export const PROVENANCE_REPOSITORY = Symbol('PROVENANCE_REPOSITORY')

/** The persistence seam for the field provenance / confirmation layer. */
export interface ProvenanceRepository {
  listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]>
  find(userId: string, taxYear: number, key: string): Promise<ProvenanceRecord | null>
  save(userId: string, taxYear: number, marking: Omit<Marking, 'value'>): Promise<ProvenanceRecord>
  remove(userId: string, taxYear: number, keys: readonly string[]): Promise<number>
  confirmAnnex(userId: string, taxYears: readonly number[], annex: Annex): Promise<number>
}
