export type AuditAction = 'READ' | 'WRITE'

export interface AuditEntry {
  userId: string
  action: AuditAction
  resource: string
  source?: string | null
}

/** One persisted audit row, as read back for the account holder's own DSGVO export. */
export interface AuditLogRow {
  action: AuditAction
  resource: string
  source?: string | null
  createdAt: Date
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')

/** The persistence seam for the tax-data access audit trail. */
export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>
  /** Oldest first. `newest` keeps only the most recent that many rows (still oldest first among them). */
  findOwnRows(userId: string, options?: { newest?: number }): Promise<AuditLogRow[]>
  /**
   * Every row strictly before `before`, oldest first, in batches of at most `batchSize`. Reads one batch at a time (keyset
   * on createdAt, id), so memory stays flat however long the log is — the complete JSON export (Art. 15/20 GDPR).
   */
  streamOwnRows(userId: string, options: { batchSize: number; before: Date }): AsyncIterable<AuditLogRow[]>
  /** The newest row's time per source, for the given sources of one user; a source without rows is absent. */
  lastSeenBySource(userId: string, sources: readonly string[]): Promise<Map<string, Date>>
}
