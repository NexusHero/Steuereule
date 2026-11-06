// In-memory fake for the Bescheid repository: honours the real per-(userId, steuerjahr) one-row
// contract without a database (ADR-0004). The writes mirror the real repository's upsert + return
// semantics; the derived Abgleich/Frist stay in BescheidService (ADR-014/048: facts stored, never
// the derived state).
import type { AssessmentField, AssessmentStatus } from '@steuereule/core'
import type { AssessmentRecord, AssessmentRepository } from '../../src/bescheid/bescheid.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeAssessmentRepository implements AssessmentRepository {
  private readonly store = new Map<string, AssessmentRecord>()

  private leer(userId: string, steuerjahr: number): AssessmentRecord {
    return {
      userId,
      steuerjahr,
      status: 'eingegangen',
      bescheiddatum: null,
      einspruchGrund: null,
      fields: { einnahmen: null, vorsorgeaufwand: null, anrechnung: null, festgesetzteSteuer: null, erstattung: null },
    }
  }

  findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setField(userId: string, steuerjahr: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, fields: { ...existing.fields, [field]: value } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setDate(userId: string, steuerjahr: number, date: string | null): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, bescheiddatum: date }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setStatus(userId: string, steuerjahr: number, status: AssessmentStatus): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated = { ...existing, status }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setAppeal(userId: string, steuerjahr: number, reason: string): Promise<AssessmentRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k) ?? this.leer(userId, steuerjahr)
    const updated: AssessmentRecord = { ...existing, status: 'einspruch-eingelegt', einspruchGrund: reason }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: AssessmentRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
