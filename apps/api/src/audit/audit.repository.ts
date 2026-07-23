// The persistence seam for the tax-data access audit trail (ADR-0008, REQ-004).
// Mirrors profile.repository.ts's interface-by-token pattern so unit tests can swap
// in an in-memory fake. Exposes exactly one write operation — append() — never
// update/delete, so "no mutation surface" is structural (enforced by the interface
// shape itself), not just a convention any caller happens to follow. findOwnRows()
// (REQ-011/ADR-0013) is a read, not a mutation — it doesn't weaken that guarantee.
export type AuditAction = 'READ' | 'WRITE'

export interface AuditEntry {
  userId: string
  action: AuditAction
  /** The resource/field-class touched, e.g. "profile" — never the sensitive value itself. */
  resource: string
}

/** One persisted audit row, as read back for the account holder's own DSGVO export. */
export interface AuditLogRow {
  action: AuditAction
  resource: string
  createdAt: Date
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')

export interface AuditRepository {
  /** Appends one immutable audit row. */
  append(entry: AuditEntry): Promise<void>
  /**
   * Reads back the caller's own audit rows, oldest first — feeds the DSGVO Art. 15/20
   * export's `accessLog` field (REQ-011/ADR-0013). Scoped strictly to `userId`; never
   * joined across users.
   */
  findOwnRows(userId: string): Promise<AuditLogRow[]>
}
