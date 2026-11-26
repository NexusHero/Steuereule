import { Inject, Injectable } from '@nestjs/common'
import { currentAuditSource } from './audit-source.js'
import { AUDIT_REPOSITORY, type AuditEntry, type AuditLogRow, type AuditRepository } from './audit.repository.js'

/** Thin application-facing wrapper around the audit repository seam. */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  /** A row without its own source takes the one of the surrounding work, e.g. the assistant of an MCP tool call. */
  append(entry: AuditEntry): Promise<void> {
    const source = entry.source ?? currentAuditSource()
    return this.repository.append(source === undefined ? entry : { ...entry, source })
  }

  /** When each of the given sources last left a row for the user ("Zuletzt aktiv" of a connected assistant). */
  lastSeenBySource(userId: string, sources: readonly string[]): Promise<Map<string, Date>> {
    return sources.length === 0 ? Promise.resolve(new Map()) : this.repository.lastSeenBySource(userId, sources)
  }

  findOwnRows(userId: string, options?: { newest?: number }): Promise<AuditLogRow[]> {
    return this.repository.findOwnRows(userId, options)
  }

  streamOwnRows(userId: string, options: { batchSize: number; before: Date }): AsyncIterable<AuditLogRow[]> {
    return this.repository.streamOwnRows(userId, options)
  }
}
