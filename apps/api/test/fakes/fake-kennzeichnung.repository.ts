// In-memory fake mirroring the real (userId, steuerjahr, key) uniqueness without a DB (ADR-0004).
import { anlageVon, type Annex, type Kennzeichnung } from '@steuereule/core'
import type { ProvenanceRecord, ProvenanceRepository } from '../../src/kennzeichnung/kennzeichnung.repository.js'

function id(userId: string, steuerjahr: number, key: string): string {
  return `${userId}::${steuerjahr}::${key}`
}

export class FakeKennzeichnungRepository implements ProvenanceRepository {
  private readonly store = new Map<string, ProvenanceRecord>()

  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<ProvenanceRecord[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => r.userId === userId && steuerjahre.includes(r.steuerjahr))
        .sort((a, b) => a.key.localeCompare(b.key)),
    )
  }

  find(userId: string, steuerjahr: number, key: string): Promise<ProvenanceRecord | null> {
    return Promise.resolve(this.store.get(id(userId, steuerjahr, key)) ?? null)
  }

  save(userId: string, taxYear: number, provenance: Omit<Kennzeichnung, 'wert'>): Promise<ProvenanceRecord> {
    return this.speichere(userId, taxYear, provenance)
  }

  speichere(userId: string, steuerjahr: number, k: Omit<Kennzeichnung, 'wert'>): Promise<ProvenanceRecord> {
    anlageVon(k.key) // same rejection of unknown keys as the real repository
    const record: ProvenanceRecord = { userId, steuerjahr, key: k.key, herkunft: k.herkunft, bestaetigt: k.bestaetigt, vorschlag: k.vorschlag }
    this.store.set(id(userId, steuerjahr, k.key), record)
    return Promise.resolve(record)
  }

  remove(userId: string, taxYear: number, keys: readonly string[]): Promise<number> {
    return this.entferne(userId, taxYear, keys)
  }

  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number> {
    let count = 0
    for (const key of keys) if (this.store.delete(id(userId, steuerjahr, key))) count += 1
    return Promise.resolve(count)
  }

  confirmAnnex(userId: string, taxYears: readonly number[], annex: Annex): Promise<number> {
    return this.bestaetigeAnlage(userId, taxYears, annex)
  }

  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Annex): Promise<number> {
    let count = 0
    for (const [k, r] of this.store) {
      if (r.userId === userId && steuerjahre.includes(r.steuerjahr) && anlageVon(r.key) === anlage && !r.bestaetigt) {
        this.store.set(k, { ...r, bestaetigt: true })
        count += 1
      }
    }
    return Promise.resolve(count)
  }

  /** Test seam: every stored record. */
  alle(): ProvenanceRecord[] {
    return [...this.store.values()]
  }
}
