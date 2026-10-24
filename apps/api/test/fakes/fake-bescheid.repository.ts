// In-memory fake for the Bescheid repository: honours the real per-(userId, steuerjahr) one-row
// contract without a database (ADR-0004). The writes mirror the real repository's upsert + return
// semantics; the derived Abgleich/Frist stay in BescheidService (ADR-014/048: facts stored, never
// the derived state).
import type { BescheidFeld, BescheidStatus } from '@steuereule/core'
import type { BescheidRecord, BescheidRepository } from '../../src/bescheid/bescheid.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeBescheidRepository implements BescheidRepository {
  private readonly store = new Map<string, BescheidRecord>()

  private leer(userId: string, steuerjahr: number): BescheidRecord {
    return {
      userId,
      steuerjahr,
      status: 'eingegangen',
      bescheiddatum: null,
      einspruchGrund: null,
      felder: { einnahmen: null, vorsorgeaufwand: null, anrechnung: null, festgesetzteSteuer: null, erstattung: null },
    }
  }

  findForUserAndYear(userId: string, steuerjahr: number): Promise<BescheidRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setFeld(userId: string, steuerjahr: number, feld: BescheidFeld, wert: string | null): Promise<BescheidRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, felder: { ...existing.felder, [feld]: wert } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<BescheidRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, bescheiddatum: datum }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<BescheidRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, status }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<BescheidRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated: BescheidRecord = { ...existing, status: 'einspruch-eingelegt', einspruchGrund: grund }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: BescheidRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
