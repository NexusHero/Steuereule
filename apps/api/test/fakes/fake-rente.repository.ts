// In-memory fake mirroring FakeLstbRepository: honours the real per-(userId, steuerjahr) scoping
// and the one-row-per-year contract without a database (ADR-0004). `setFeld`/`setRentenart` mirror
// the real repository's return shape (the full record) and upsert semantics; the derived fold is
// left to RenteService (as in production, the repository stores facts, never the derived state —
// ADR-014/048).
import type { RentenFeldId } from '@steuereule/core'
import type { RenteRecord, RenteRepository } from '../../src/rente/rente.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeRenteRepository implements RenteRepository {
  private readonly store = new Map<string, RenteRecord>()

  findForUserAndYear(userId: string, steuerjahr: number): Promise<RenteRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, wert: string | null): Promise<RenteRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: RenteRecord = existing ?? {
      userId,
      steuerjahr,
      rentenart: null,
      jahresbetrag: null,
      rentenbeginnJahr: null,
      alterBeiRentenbeginn: null,
    }
    const updated: RenteRecord = { ...record, [feld]: wert }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<RenteRecord> {
    const k = key(userId, steuerjahr)
    const existing = this.store.get(k)
    const record: RenteRecord = existing ?? {
      userId,
      steuerjahr,
      rentenart: null,
      jahresbetrag: null,
      rentenbeginnJahr: null,
      alterBeiRentenbeginn: null,
    }
    const updated: RenteRecord = { ...record, rentenart: art }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing the setters' upsert. */
  seed(record: RenteRecord): void {
    this.store.set(key(record.userId, record.steuerjahr), record)
  }
}
