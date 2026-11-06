// In-memory fake mirroring the real (userId, steuerjahr, key) uniqueness without a DB (ADR-0004).
import { annexOf, type Annex, type Marking } from '@steuereule/core'
import type { ProvenanceRecord, ProvenanceRepository } from '../../src/marking/marking.repository.js'

function id(userId: string, taxYear: number, key: string): string {
  return `${userId}::${taxYear}::${key}`
}

export class FakeMarkingRepository implements ProvenanceRepository {
  private readonly store = new Map<string, ProvenanceRecord>()

  listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => r.userId === userId && taxYears.includes(r.taxYear))
        .sort((a, b) => a.key.localeCompare(b.key)),
    )
  }

  find(userId: string, taxYear: number, key: string): Promise<ProvenanceRecord | null> {
    return Promise.resolve(this.store.get(id(userId, taxYear, key)) ?? null)
  }

  save(userId: string, taxYear: number, k: Omit<Marking, 'value'>): Promise<ProvenanceRecord> {
    annexOf(k.key) // same rejection of unknown keys as the real repository
    const record: ProvenanceRecord = { userId, taxYear, key: k.key, provenance: k.provenance, confirmed: k.confirmed, proposal: k.proposal }
    this.store.set(id(userId, taxYear, k.key), record)
    return Promise.resolve(record)
  }

  remove(userId: string, taxYear: number, keys: readonly string[]): Promise<number> {
    let count = 0
    for (const key of keys) if (this.store.delete(id(userId, taxYear, key))) count += 1
    return Promise.resolve(count)
  }

  confirmAnnex(userId: string, taxYears: readonly number[], annex: Annex): Promise<number> {
    let count = 0
    for (const [k, r] of this.store) {
      if (r.userId === userId && taxYears.includes(r.taxYear) && annexOf(r.key) === annex && !r.confirmed) {
        this.store.set(k, { ...r, confirmed: true })
        count += 1
      }
    }
    return Promise.resolve(count)
  }

  /** Test seam: every stored record. */
  all(): ProvenanceRecord[] {
    return [...this.store.values()]
  }
}
