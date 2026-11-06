// In-memory fake mirroring FakeRenteRepository: honours the real per-(userId, steuerjahr)
// scoping and the one-row-per-year contract without a database (ADR-0004). `setFeld` mirrors
// the real repository's return shape (the full record) and upsert semantics; the derived
// Kapital-Posten / Günstigerprüfung are left to KapitalService (as in production, the
// repository stores facts, never the derived state — ADR-014/048).
import type { CapitalFieldId } from '@steuereule/core'
import type { CapitalOwner, CapitalRecord, CapitalRepository } from '../../src/capital/capital.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeCapitalRepository implements CapitalRepository {
  private readonly store = new Map<string, CapitalRecord>()

  findForUserAndYear(userId: string, taxYear: number): Promise<CapitalRecord | null> {
    return Promise.resolve(this.store.get(key(userId, taxYear)) ?? null)
  }

  setField(userId: string, taxYear: number, field: CapitalFieldId, value: string | null): Promise<CapitalRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k)
    const record: CapitalRecord = existing ?? {
      userId,
      taxYear,
      kapitalertraege: null,
      sparerPauschbetrag: null,
      kapitalertragsteuer: null,
      solidaritaetszuschlag: null,
      kirchensteuer: null,
    }
    const updated: CapitalRecord = { ...record, [field]: value }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setOwner(userId: string, taxYear: number, inhaber: CapitalOwner): Promise<CapitalRecord> {
    const k = key(userId, taxYear)
    const record: CapitalRecord = this.store.get(k) ?? {
      userId,
      taxYear,
      kapitalertraege: null,
      sparerPauschbetrag: null,
      kapitalertragsteuer: null,
      solidaritaetszuschlag: null,
      kirchensteuer: null,
    }
    const updated: CapitalRecord = { ...record, inhaber }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a record directly, bypassing the setter's upsert; unnamed fields are offen. */
  seed(record: Pick<CapitalRecord, 'userId' | 'taxYear' | 'kapitalertraege'> & Partial<CapitalRecord>): void {
    this.store.set(key(record.userId, record.taxYear), {
      sparerPauschbetrag: null,
      kapitalertragsteuer: null,
      solidaritaetszuschlag: null,
      kirchensteuer: null,
      ...record,
    })
  }
}
