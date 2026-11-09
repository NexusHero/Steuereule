export type AuditAction = 'READ' | 'WRITE'

export interface AuditEntry {
  userId: string
  action: AuditAction
  resource: string
  source?: string | null
  /** JSON with non-sensitive context (field keys, action ids, model) — never a tax value. */
  detail?: string | null
}

/** One persisted audit row, as read back for the account holder's own DSGVO export. */
export interface AuditLogRow {
  action: AuditAction
  resource: string
  source?: string | null
  detail?: string | null
  createdAt: Date
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')

/** The persistence seam for the tax-data access audit trail. */
export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>
  findOwnRows(userId: string): Promise<AuditLogRow[]>
}
