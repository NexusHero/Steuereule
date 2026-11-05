// In-memory fake mirroring FakeProfileRepository: honours the real per-userId scoping and
// the derived-zuordnung contract without a database. `create`/`setSteuerjahr` mirror the
// real repository's return shapes; the derived Zuordnung state is left to BelegService (as
// in production, the repository stores facts, never the derived state — ADR-014/048).
import type { ReceiptRecord, ReceiptRepository, CreateReceiptData, SetAssignmentData } from '../../src/beleg/beleg.repository.js'

export class FakeBelegRepository implements ReceiptRepository {
  private readonly rows: ReceiptRecord[] = []
  private seq = 0

  findAllForUser(userId: string): Promise<ReceiptRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    )
  }

  findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.userId === userId && row.id === id) ?? null)
  }

  create(userId: string, data: CreateReceiptData): Promise<ReceiptRecord> {
    const now = new Date()
    const record: ReceiptRecord = {
      id: `beleg-${this.seq++}`,
      userId,
      dateiname: data.dateiname,
      ...(data.art !== undefined ? { art: data.art } : {}),
      ...(data.belegdatum !== undefined ? { belegdatum: data.belegdatum } : {}),
      ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: data.zahlungsdatum } : {}),
      steuerjahr: null,
      vorschlagVerworfen: false,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(record)
    return Promise.resolve(record)
  }

  setAssignment(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null> {
    return this.setZuordnung(userId, id, data)
  }

  setZuordnung(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: ReceiptRecord = {
      ...this.rows[index]!,
      steuerjahr: data.steuerjahr,
      vorschlagVerworfen: data.vorschlagVerworfen,
      updatedAt: new Date(),
    }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  /** Test seam: seed a record directly, bypassing create()'s audit side-effects. */
  seed(record: ReceiptRecord): void {
    this.rows.push(record)
  }

  recordCount(): number {
    return this.rows.length
  }
}
