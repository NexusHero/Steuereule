// In-memory fake mirroring FakeProfileRepository: honours the real "append only, no
// update/delete" contract by construction — there is no method on this class but
// append() and a read-back helper for assertions.
import type { AuditEntry, AuditRepository } from '../../src/audit/audit.repository.js'

export class FakeAuditRepository implements AuditRepository {
  private readonly rows: AuditEntry[] = []

  append(entry: AuditEntry): Promise<void> {
    this.rows.push({ ...entry })
    return Promise.resolve()
  }

  all(): readonly AuditEntry[] {
    return this.rows
  }
}
