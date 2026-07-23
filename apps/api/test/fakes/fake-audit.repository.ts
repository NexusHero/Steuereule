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

  findOwnRows(userId: string): Promise<AuditLogRow[]> {
    const rows = this.rows
      .filter((row) => row.userId === userId)
      .map(({ action, resource, createdAt }) => ({ action, resource, createdAt }))
    return Promise.resolve(rows)
  }

  all(): readonly AuditEntry[] {
    return this.rows
  }
}
