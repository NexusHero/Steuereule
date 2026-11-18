// In-memory fake mirroring FakeProfileRepository: honours the real per-userId scoping and
// the derived-zuordnung contract without a database. `create`/`setSteuerjahr` mirror the
// real repository's return shapes; the derived Zuordnung state is left to BelegService (as
// in production, the repository stores facts, never the derived state — ADR-014/048).
import type {
  ReceiptRecord,
  ReceiptRepository,
  ReceiptFileMetaRecord,
  CreateReceiptData,
  RecordReadData,
  SetAssignmentData,
} from '../../src/receipt/receipt.repository.js'
import type { HolderRef, ReceiptType } from '@steuereule/core'

export class FakeReceiptRepository implements ReceiptRepository {
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
      fileName: data.fileName,
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.belegdatum !== undefined ? { belegdatum: data.belegdatum } : {}),
      ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: data.zahlungsdatum } : {}),
      taxYear: null,
      proposalDismissed: false,
      fileMeta: null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(record)
    return Promise.resolve(record)
  }

  setAssignment(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: ReceiptRecord = {
      ...this.rows[index]!,
      taxYear: data.taxYear,
      proposalDismissed: data.proposalDismissed,
      updatedAt: new Date(),
    }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  setHolders(userId: string, id: string, holders: readonly HolderRef[], taxYear: number): Promise<ReceiptRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: ReceiptRecord = { ...this.rows[index]!, holders: [...holders], holderTaxYear: holders.length > 0 ? taxYear : null, updatedAt: new Date() }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  setKind(userId: string, id: string, kind: ReceiptType): Promise<ReceiptRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: ReceiptRecord = { ...this.rows[index]!, kind, updatedAt: new Date() }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  recordRead(userId: string, id: string, data: RecordReadData): Promise<ReceiptRecord | null> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(null)
    const updated: ReceiptRecord = {
      ...this.rows[index]!,
      readAt: new Date(),
      readOutcome: data.outcome,
      readReason: data.reason,
      draftsTaxYear: data.draftsTaxYear,
      ...(data.belegdatum !== undefined ? { belegdatum: data.belegdatum } : {}),
      updatedAt: new Date(),
    }
    this.rows[index] = updated
    return Promise.resolve(updated)
  }

  deleteForUser(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return Promise.resolve(false)
    this.rows.splice(index, 1)
    return Promise.resolve(true)
  }

  setFileMeta(userId: string, id: string, fileMeta: ReceiptFileMetaRecord | null): void {
    const index = this.rows.findIndex((row) => row.userId === userId && row.id === id)
    if (index === -1) return
    this.rows[index] = {
      ...this.rows[index]!,
      fileMeta,
      updatedAt: new Date(),
    }
  }

  /** Test seam: seed a record directly, bypassing create()'s audit side-effects. */
  seed(record: ReceiptRecord): void {
    this.rows.push(record)
  }

  recordCount(): number {
    return this.rows.length
  }
}
