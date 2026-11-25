// In-memory fake mirroring FakeProfileRepository: honours the real "append only, no
// update/delete" contract by construction — there is no method on this class but
// append(), the real findOwnRows() read, and an all() read-back helper for assertions.
import type { AuditEntry, AuditLogRow, AuditRepository } from '../../src/audit/audit.repository.js'

export class FakeAuditRepository implements AuditRepository {
  private readonly rows: (AuditEntry & { createdAt: Date })[] = []

  append(entry: AuditEntry): Promise<void> {
    this.rows.push({ ...entry, createdAt: new Date() })
    return Promise.resolve()
  }

  /** A row written at a known time, for tests about what an export does and does not include. */
  appendAt(entry: AuditEntry, createdAt: Date): void {
    this.rows.push({ ...entry, createdAt })
  }

  findOwnRows(userId: string, options: { newest?: number } = {}): Promise<AuditLogRow[]> {
    this.findOwnRowsCalls++
    const own = this.rows
      .filter((row) => row.userId === userId)
      .map(({ action, resource, source, createdAt }) => ({ action, resource, source: source ?? null, createdAt }))
    return Promise.resolve(options.newest === undefined ? own : own.slice(-options.newest))
  }

  /** Counts how many rows were ever held in one batch, so a test can prove the read is paginated. */
  largestBatch = 0
  findOwnRowsCalls = 0

  async *streamOwnRows(userId: string, options: { batchSize: number; before: Date }): AsyncGenerator<AuditLogRow[]> {
    const own = this.rows
      .filter((row) => row.userId === userId && row.createdAt < options.before)
      .map(({ action, resource, source, createdAt }) => ({ action, resource, source: source ?? null, createdAt }))
    for (let from = 0; from < own.length; from += options.batchSize) {
      const batch = own.slice(from, from + options.batchSize)
      this.largestBatch = Math.max(this.largestBatch, batch.length)
      yield batch
    }
  }

  lastSeenBySource(userId: string, sources: readonly string[]): Promise<Map<string, Date>> {
    const seen = new Map<string, Date>()
    for (const row of this.rows) {
      if (row.userId !== userId || !row.source || !sources.includes(row.source)) continue
      const known = seen.get(row.source)
      if (known === undefined || known < row.createdAt) seen.set(row.source, row.createdAt)
    }
    return Promise.resolve(seen)
  }

  all(): readonly AuditEntry[] {
    return this.rows
  }
}
