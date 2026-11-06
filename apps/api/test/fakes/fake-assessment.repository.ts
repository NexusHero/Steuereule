// In-memory fake for the Bescheid repository: honours the real per-(userId, steuerjahr) one-row
// contract without a database (ADR-0004). The writes mirror the real repository's upsert + return
// semantics; the derived Abgleich/Frist stay in BescheidService (ADR-014/048: facts stored, never
// the derived state).
import type { AssessmentField, AssessmentStatus } from '@steuereule/core'
import type { AssessmentRecord, AssessmentRepository } from '../../src/assessment/assessment.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeAssessmentRepository implements AssessmentRepository {
  private readonly store = new Map<string, AssessmentRecord>()

  private leer(userId: string, taxYear: number): AssessmentRecord {
    return {
      userId,
      taxYear,
      status: 'eingegangen',
      assessmentDate: null,
      appealReason: null,
      fields: { einnahmen: null, vorsorgeaufwand: null, anrechnung: null, festgesetzteSteuer: null, erstattung: null },
    }
  }

  findForUserAndYear(userId: string, taxYear: number): Promise<AssessmentRecord | null> {
    return Promise.resolve(this.store.get(key(userId, taxYear)) ?? null)
  }

  setField(userId: string, taxYear: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, fields: { ...existing.fields, [field]: value } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, assessmentDate: date }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setStatus(userId: string, taxYear: number, status: AssessmentStatus): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = { ...existing, status }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setAppeal(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated: AssessmentRecord = { ...existing, status: 'einspruch-eingelegt', appealReason: reason }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: AssessmentRecord): void {
    this.store.set(key(record.userId, record.taxYear), record)
  }
}
