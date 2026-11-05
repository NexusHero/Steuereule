// In-memory fake mirroring FakeRenteRepository: honours the real per-(userId, steuerjahr)
// scoping and the one-row-per-year contract without a database (ADR-0004). `setFeld` mirrors
// the real repository's return shape (the full record) and upsert semantics; the derived
// Kapital-Posten / Günstigerprüfung are left to KapitalService (as in production, the
// repository stores facts, never the derived state — ADR-014/048).
import type { CapitalFieldId } from '@steuereule/core'
import type { CapitalOwner, CapitalRecord, CapitalRepository } from '../../src/kapital/kapital.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeKapitalRepository implements CapitalRepository {
  private readonly store = new Map<string, CapitalRecord>()

  findForUserAndYear(userId: string, steuerjahr: number): Promise<CapitalRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setField(userId: string, taxYear: number, field: CapitalFieldId, value: string | null): Promise<CapitalRecord> {
    return this.setFeld(userId, taxYear, field, value)
  }

  setFeld(userId: string, steuerjahr: number, feld: CapitalFieldId, wert: string | null): Promise<CapitalRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: CapitalRecord = existing ?? {
      userId,
      steuerjahr,
      kapitalertraege: null,
      sparerPauschbetrag: null,
      kapitalertragsteuer: null,
      solidaritaetszuschlag: null,
      kirchensteuer: null,
    }
    const updated: CapitalRecord = { ...record, [feld]: wert }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setOwner(userId: string, taxYear: number, owner: CapitalOwner): Promise<CapitalRecord> {
    return this.setInhaber(userId, taxYear, owner)
  }

  setInhaber(userId: string, steuerjahr: number, inhaber: CapitalOwner): Promise<CapitalRecord> {
    const k = key(userId, steuerjahr)
    const record: CapitalRecord = this.store.get(k) ?? {
      userId,
      steuerjahr,
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
  seed(record: Pick<CapitalRecord, 'userId' | 'steuerjahr' | 'kapitalertraege'> & Partial<CapitalRecord>): void {
    this.store.set(key(record.userId, record.steuerjahr), {
      sparerPauschbetrag: null,
      kapitalertragsteuer: null,
      solidaritaetszuschlag: null,
      kirchensteuer: null,
      ...record,
    })
  }
}
