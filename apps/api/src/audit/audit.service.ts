// Thin application-facing wrapper around the audit repository seam (ADR-0008,
// REQ-004). Kept deliberately dumb — no branching — so the interesting append-only
// guarantee lives entirely in the AuditRepository interface shape, not in behaviour
// this class could accidentally special-case away. findOwnRows (REQ-011/ADR-0013) is
// a pass-through read for the account holder's own DSGVO export.
import { Inject, Injectable } from '@nestjs/common'
import { AUDIT_REPOSITORY, type AuditEntry, type AuditLogRow, type AuditRepository } from './audit.repository.js'

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  append(entry: AuditEntry): Promise<void> {
    return this.repository.append(entry)
  }

  findOwnRows(userId: string): Promise<AuditLogRow[]> {
    return this.repository.findOwnRows(userId)
  }
}
