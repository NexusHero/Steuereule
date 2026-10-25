// In-memory fake mirroring FakeRenteRepository: honours the real per-(userId, steuerjahr)
// scoping and the one-row-per-year contract without a database (ADR-0004). `setFeld` mirrors
// the real repository's return shape (the full record) and upsert semantics; the derived
// Kapital-Posten / Günstigerprüfung are left to KapitalService (as in production, the
// repository stores facts, never the derived state — ADR-014/048).
import type { KapitalFeldId } from '@steuereule/core'
import type { KapitalRecord, KapitalRepository } from '../../src/kapital/kapital.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeKapitalRepository implements KapitalRepository {
  private readonly store = new Map<string, KapitalRecord>()

  findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: KapitalRecord = existing ?? { userId, steuerjahr, kapitalertraege: null }
    const updated: KapitalRecord = { ...record, [feld]: wert }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing the setter's upsert. */
  seed(record: KapitalRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
