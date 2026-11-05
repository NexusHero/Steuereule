// In-memory fake for the Bescheid repository: honours the real per-(userId, steuerjahr) one-row
// contract without a database (ADR-0004). The writes mirror the real repository's upsert + return
// semantics; the derived Abgleich/Frist stay in BescheidService (ADR-014/048: facts stored, never
// the derived state).
import type { AssessmentField, BescheidStatus } from '@steuereule/core'
import type { AssessmentRecord, AssessmentRepository } from '../../src/bescheid/bescheid.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeBescheidRepository implements AssessmentRepository {
  private readonly store = new Map<string, AssessmentRecord>()

  private leer(userId: string, steuerjahr: number): AssessmentRecord {
    return {
      userId,
      steuerjahr,
      status: 'eingegangen',
      bescheiddatum: null,
      einspruchGrund: null,
      felder: { einnahmen: null, vorsorgeaufwand: null, anrechnung: null, festgesetzteSteuer: null, erstattung: null },
    }
  }

  findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setField(userId: string, taxYear: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord> {
    return this.setFeld(userId, taxYear, field, value)
  }

  setFeld(userId: string, steuerjahr: number, feld: AssessmentField, wert: string | null): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, felder: { ...existing.felder, [feld]: wert } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord> {
    return this.setDatum(userId, taxYear, date)
  }

  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, bescheiddatum: datum }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, status }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setAppeal(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord> {
    return this.setEinspruch(userId, taxYear, reason)
  }

  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated: AssessmentRecord = { ...existing, status: 'einspruch-eingelegt', einspruchGrund: grund }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: AssessmentRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
