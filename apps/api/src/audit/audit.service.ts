import { Inject, Injectable } from '@nestjs/common'
import { AUDIT_REPOSITORY, type AuditEntry, type AuditLogRow, type AuditRepository } from './audit.repository.js'

/** Thin application-facing wrapper around the audit repository seam. */
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
