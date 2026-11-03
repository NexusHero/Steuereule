// In-memory fake mirroring the real (userId, steuerjahr, key) uniqueness without a DB (ADR-0004).
import { anlageVon, type Anlage, type Kennzeichnung } from '@steuereule/core'
import type { KennzeichnungRecord, KennzeichnungRepository } from '../../src/kennzeichnung/kennzeichnung.repository.js'

function id(userId: string, steuerjahr: number, key: string): string {
  return `${userId}::${steuerjahr}::${key}`
}

export class FakeKennzeichnungRepository implements KennzeichnungRepository {
  private readonly store = new Map<string, KennzeichnungRecord>()

  listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<KennzeichnungRecord[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => r.userId === userId && steuerjahre.includes(r.steuerjahr))
        .sort((a, b) => a.key.localeCompare(b.key)),
    )
  }

  find(userId: string, steuerjahr: number, key: string): Promise<KennzeichnungRecord | null> {
    return Promise.resolve(this.store.get(id(userId, steuerjahr, key)) ?? null)
  }

  speichere(userId: string, steuerjahr: number, k: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord> {
    anlageVon(k.key) // same rejection of unknown keys as the real repository
    const record: KennzeichnungRecord = { userId, steuerjahr, key: k.key, herkunft: k.herkunft, bestaetigt: k.bestaetigt, vorschlag: k.vorschlag }
    this.store.set(id(userId, steuerjahr, k.key), record)
    return Promise.resolve(record)
  }

  entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number> {
    let count = 0
    for (const key of keys) if (this.store.delete(id(userId, steuerjahr, key))) count += 1
    return Promise.resolve(count)
  }

  bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Anlage): Promise<number> {
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
  alle(): KennzeichnungRecord[] {
    return [...this.store.values()]
  }
}
