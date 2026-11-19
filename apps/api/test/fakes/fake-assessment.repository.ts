// In-memory fake for the Bescheid repository: honours the real per-(userId, steuerjahr) one-row
// contract without a database (ADR-0004). The writes mirror the real repository's upsert + return
// semantics; the derived Abgleich/Frist stay in BescheidService (ADR-014/048: facts stored, never
// the derived state).
import type { AppealOutcome, AssessmentStatus } from '@steuereule/core'
import type { AssessmentRecord, AssessmentRepository, AssessmentStoredField } from '../../src/assessment/assessment.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeAssessmentRepository implements AssessmentRepository {
  private readonly store = new Map<string, AssessmentRecord>()
  /** Years the fake treats as declared in the app (a TaxYear row or answers), and Eckjahre it created. */
  readonly declaredYears = new Set<string>()
  readonly externalYears = new Set<string>()

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

  listForUser(userId: string): Promise<AssessmentRecord[]> {
    return Promise.resolve([...this.store.values()].filter((r) => r.userId === userId).sort((a, b) => a.taxYear - b.taxYear))
  }

  setField(userId: string, taxYear: number, field: AssessmentStoredField, value: string | null): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated = field in existing.fields
      ? { ...existing, fields: { ...existing.fields, [field]: value } }
      : { ...existing, positions: { ...existing.positions, [field]: value } }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setExplanations(userId: string, taxYear: number, text: string | null): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const updated = { ...(this.store.get(k) ?? this.leer(userId, taxYear)), explanations: text }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  hasDeclaration(userId: string, taxYear: number): Promise<boolean> {
    const k = key(userId, taxYear)
    return Promise.resolve(this.declaredYears.has(k) || this.externalYears.has(k))
  }

  async recordExternalYear(userId: string, taxYear: number): Promise<boolean> {
    if (await this.hasDeclaration(userId, taxYear)) return false
    this.externalYears.add(key(userId, taxYear))
    return true
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

  setAppeal(userId: string, taxYear: number, reason: string, date: string): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k) ?? this.leer(userId, taxYear)
    const updated: AssessmentRecord = { ...existing, status: 'einspruch-eingelegt', appealReason: reason, appealDate: date, appealOutcome: 'offen', appealOutcomeAmount: null }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setAppealOutcome(userId: string, taxYear: number, outcome: AppealOutcome, amount: string | null): Promise<AssessmentRecord> {
    const k = key(userId, taxYear)
    const updated: AssessmentRecord = { ...(this.store.get(k) ?? this.leer(userId, taxYear)), appealOutcome: outcome, appealOutcomeAmount: amount }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly. */
  seed(record: AssessmentRecord): void {
    this.store.set(key(record.userId, record.taxYear), record)
  }
}
