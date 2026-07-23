// The persistence seam for the tax-data access audit trail (ADR-0008, REQ-004).
// Mirrors profile.repository.ts's interface-by-token pattern so unit tests can swap
// in an in-memory fake, but exposes strictly one write operation — append() — never
// update/delete, so "no mutation surface" is structural (enforced by the interface
// shape itself), not just a convention any caller happens to follow.
export type AuditAction = 'READ' | 'WRITE'

export interface AuditEntry {
  userId: string
  action: AuditAction
  /** The resource/field-class touched, e.g. "profile" — never the sensitive value itself. */
  resource: string
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')

export interface AuditRepository {
  /** Appends one immutable audit row. The only method this interface has. */
  append(entry: AuditEntry): Promise<void>
}
