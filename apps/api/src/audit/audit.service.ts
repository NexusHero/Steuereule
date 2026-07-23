// Thin application-facing wrapper around the audit repository seam (ADR-0008,
// REQ-004). Kept deliberately dumb — one method, no branching — so the interesting
// append-only guarantee lives entirely in the AuditRepository interface shape, not
// in behaviour this class could accidentally special-case away.
import { Inject, Injectable } from '@nestjs/common'
import { AUDIT_REPOSITORY, type AuditEntry, type AuditRepository } from './audit.repository.js'

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  append(entry: AuditEntry): Promise<void> {
    return this.repository.append(entry)
  }
}
