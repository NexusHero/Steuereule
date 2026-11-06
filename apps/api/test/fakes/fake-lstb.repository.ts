// In-memory fake mirroring FakeBelegRepository: honours the real per-(userId, steuerjahr)
// scoping and the one-row-per-year contract without a database (ADR-0004). `setFeld` mirrors
// the real repository's return shape (the full record) and upsert semantics; the derived
// LstbZustand is left to LstbService (as in production, the repository stores facts, never
// the derived state — ADR-014/048).
import type { WageTaxCertificateFieldId } from '@steuereule/core'
import type { WageTaxCertificateRecord, WageTaxCertificateRepository } from '../../src/lstb/lstb.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeLstbRepository implements WageTaxCertificateRepository {
  private readonly store = new Map<string, WageTaxCertificateRecord>()

  findForUserAndYear(userId: string, steuerjahr: number): Promise<WageTaxCertificateRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setField(userId: string, steuerjahr: number, field: WageTaxCertificateFieldId, value: string | null): Promise<WageTaxCertificateRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: WageTaxCertificateRecord = existing ?? {
      userId,
      steuerjahr,
      bruttoarbeitslohn: null,
      lohnsteuer: null,
      sozialversicherung: null,
    }
    const updated: WageTaxCertificateRecord = { ...record, [field]: value }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing setFeld's upsert. */
  seed(record: WageTaxCertificateRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
