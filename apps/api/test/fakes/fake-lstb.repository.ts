// In-memory fake mirroring FakeBelegRepository: honours the real per-(userId, steuerjahr)
// scoping and the one-row-per-year contract without a database (ADR-0004). `setFeld` mirrors
// the real repository's return shape (the full record) and upsert semantics; the derived
// LstbZustand is left to LstbService (as in production, the repository stores facts, never
// the derived state — ADR-014/048).
import type { LstbFeldId } from '@steuereule/core'
import type { LstbRecord, LstbRepository } from '../../src/lstb/lstb.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeLstbRepository implements LstbRepository {
  private readonly store = new Map<string, LstbRecord>()

  findForUserAndYear(userId: string, steuerjahr: number): Promise<LstbRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, wert: string | null): Promise<LstbRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: LstbRecord = existing ?? {
      userId,
      steuerjahr,
      bruttoarbeitslohn: null,
      lohnsteuer: null,
      sozialversicherung: null,
    }
    const updated: LstbRecord = { ...record, [feld]: wert }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing setFeld's upsert. */
  seed(record: LstbRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
