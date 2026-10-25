// In-memory fake mirroring the real (userId, steuerjahr, postenKey) uniqueness without a DB
// (ADR-0004). `create`/`bestaetige` mirror the real repository's shapes; the copy logic itself
// is UebernahmeService's (as in production, the repository stores Kennzeichnungen, never copies).
import type {
  UebernahmeKennzeichnungRecord,
  UebernahmeRepository,
} from '../../src/uebernahme/uebernahme.repository.js'

function key(userId: string, steuerjahr: number, postenKey: string): string {
  return `${userId}::${steuerjahr}::${postenKey}`
}

export class FakeUebernahmeRepository implements UebernahmeRepository {
  private readonly store = new Map<string, UebernahmeKennzeichnungRecord>()

  listForUserAndYear(userId: string, steuerjahr: number): Promise<UebernahmeKennzeichnungRecord[]> {
    return Promise.resolve(
      [...this.store.values()].filter((r) => r.userId === userId && r.steuerjahr === steuerjahr),
    )
  }

  findForUserAndYearAndKey(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr, postenKey)) ?? null)
  }

  create(userId: string, steuerjahr: number, vorjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord> {
    const record: UebernahmeKennzeichnungRecord = { userId, steuerjahr, vorjahr, postenKey, bestaetigt: false }
    this.store.set(key(userId, steuerjahr, postenKey), record)
    return Promise.resolve(record)
  }

  bestaetige(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null> {
    const k = key(userId, steuerjahr, postenKey)
    const existing = this.store.get(k)
    if (existing === undefined) return Promise.resolve(null)
    const updated = { ...existing, bestaetigt: true }
    this.store.set(k, updated)
    return Promise.resolve(updated)
  }

  /** Test seam: seed a Kennzeichnung directly. */
  seed(record: UebernahmeKennzeichnungRecord): void {
    this.store.set(key(record.userId, record.steuerjahr, record.postenKey), record)
  }
}
