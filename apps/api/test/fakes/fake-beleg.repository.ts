// In-memory fake mirroring FakeProfileRepository: honours the real per-userId scoping and
// the derived-zuordnung contract without a database. `create`/`setSteuerjahr` mirror the
// real repository's return shapes; the derived Zuordnung state is left to BelegService (as
// in production, the repository stores facts, never the derived state — ADR-014/048).
import type { BelegRecord, BelegRepository, CreateBelegData } from '../../src/beleg/beleg.repository.js'

export class FakeBelegRepository implements BelegRepository {
  private readonly rows: BelegRecord[] = []
  private seq = 0

  findAllForUser(userId: string): Promise<BelegRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    )
  }

  findByIdForUser(userId: string, id: string): Promise<BelegRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.userId === userId && row.id === id) ?? null)
  }

  create(userId: string, data: CreateBelegData): Promise<BelegRecord> {
    const now = new Date()
    const record: BelegRecord = {
      id: `beleg-${this.seq++}`,
      userId,
      dateiname: data.dateiname,
      ...(data.belegdatum !== undefined ? { belegdatum: data.belegdatum } : {}),
      ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: data.zahlungsdatum } : {}),
      steuerjahr: null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(record)
    return Promise.resolve(record)
  }

  setSteuerjahr(userId: string, id: string, steuerjahr: number): Promise<BelegRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: BelegRecord = { ...this.rows[index]!, steuerjahr, updatedAt: new Date() }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  /** Test seam: seed a record directly, bypassing create()'s audit side-effects. */
  seed(record: BelegRecord): void {
    this.rows.push(record)
  }

  recordCount(): number {
    return this.rows.length
  }
}
