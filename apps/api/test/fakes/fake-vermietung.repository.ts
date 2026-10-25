// In-memory fake mirroring FakeRenteRepository: honours the real (userId, steuerjahr, id)
// scoping and the one-row-per-object contract without a database (ADR-0004). `create`/`setFeld`
// mirror the real repository's return shape and semantics (setFeld returns null for a foreign or
// unknown objectId — never a cross-user update); the derived facts are left to VermietungService
// (as in production, the repository stores facts, never the derived state — ADR-014/048).
import type { VermietungFeldId } from '@steuereule/core'
import type { VermietungsobjektRecord, VermietungRepository } from '../../src/vermietung/vermietung.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeVermietungRepository implements VermietungRepository {
  private readonly store = new Map<string, VermietungsobjektRecord>()
  private counter = 0

  listForUserAndYear(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord[]> {
    const k = key(userId, steuerjahr)
    return Promise.resolve([...this.store.values()].filter((r) => key(r.userId, r.steuerjahr) === k))
  }

  create(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord> {
    this.counter += 1
    const record: VermietungsobjektRecord = {
      id: `fake-id-${this.counter}`,
      userId,
      steuerjahr,
      mieteinnahmen: null,
      anschaffungskosten: null,
      baujahr: null,
      werbungskosten: null,
    }
    this.store.set(`${key(userId, steuerjahr)}::${record.id}`, record)
    return Promise.resolve(record)
  }

  setFeld(userId: string, steuerjahr: number, objektId: string, feld: VermietungFeldId, wert: string | null): Promise<VermietungsobjektRecord | null> {
    const k = `${key(userId, steuerjahr)}::${objektId}`
    const existing = this.store.get(k)
    if (existing === undefined) return Promise.resolve(null)
    const updated: VermietungsobjektRecord = { ...existing, [feld]: wert }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a full record directly, bypassing the create/setFeld paths. */
  seed(record: VermietungsobjektRecord): void {
    this.store.set(`${key(record.userId, record.steuerjahr)}::${record.id}`, record)
  }
}
