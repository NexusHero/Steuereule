// In-memory fake mirroring FakeLstbRepository: honours the real per-(userId, steuerjahr) scoping
// and the one-row-per-year contract without a database (ADR-0004). `setFeld`/`setRentenart` mirror
// the real repository's return shape (the full record) and upsert semantics; the derived fold is
// left to RenteService (as in production, the repository stores facts, never the derived state —
// ADR-014/048).
import type { PensionFieldId } from '@steuereule/core'
import type { PensionRecord, PensionRepository } from '../../src/rente/rente.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakePensionRepository implements PensionRepository {
  private readonly store = new Map<string, PensionRecord>()

  findForUserAndYear(userId: string, taxYear: number): Promise<PensionRecord | null> {
    return Promise.resolve(this.store.get(key(userId, taxYear)) ?? null)
  }

  setField(userId: string, taxYear: number, field: PensionFieldId, value: string | null): Promise<PensionRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k)
    const record: PensionRecord = existing ?? {
      userId,
      taxYear,
      rentenart: null,
      jahresbetrag: null,
      rentenbeginnJahr: null,
      alterBeiRentenbeginn: null,
    }
    const updated: PensionRecord = { ...record, [field]: value }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setPensionKind(userId: string, taxYear: number, kind: string | null): Promise<PensionRecord> {
    const k = key(userId, taxYear)
    const existing = this.store.get(k)
    const record: PensionRecord = existing ?? {
      userId,
      taxYear,
      rentenart: null,
      jahresbetrag: null,
      rentenbeginnJahr: null,
      alterBeiRentenbeginn: null,
    }
    const updated: PensionRecord = { ...record, rentenart: kind }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing the setters' upsert. */
  seed(record: PensionRecord): void {
    this.store.set(key(record.userId, record.taxYear), record)
  }
}
