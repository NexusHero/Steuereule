import type { Annex, Marking } from '@steuereule/core'

export type ProvenanceRecord = Omit<Marking, 'value' | 'value'> & {
  readonly userId: string
  readonly taxYear: number
  /** When the marking last changed; tells a marking someone rewrote from one left as it was. */
  readonly updatedAt?: Date
}
export const PROVENANCE_REPOSITORY = Symbol('PROVENANCE_REPOSITORY')

/** The persistence seam for the field provenance / confirmation layer. */
export interface ProvenanceRepository {
  listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]>
  find(userId: string, taxYear: number, key: string): Promise<ProvenanceRecord | null>
  save(userId: string, taxYear: number, marking: Omit<Marking, 'value'>): Promise<ProvenanceRecord>
  remove(userId: string, taxYear: number, keys: readonly string[]): Promise<number>
  confirmAnnex(userId: string, taxYears: readonly number[], annex: Annex): Promise<number>
  /** Confirms exactly these unconfirmed markings of the Anlage (MCP-4): what the user saw, nothing written since. */
  confirmKeys(userId: string, taxYears: readonly number[], annex: Annex, keys: readonly string[]): Promise<number>
  /** Drops every marking of the year whose key starts so (the drafts of a business that is gone). */
  removeByKeyPrefix(userId: string, taxYear: number, prefix: string): Promise<number>
}
