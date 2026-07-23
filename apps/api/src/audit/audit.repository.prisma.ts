import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AuditEntry, AuditRepository } from './audit.repository.js'

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  // Explicit token — see the comment on ProfileController's constructor for why.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async append(entry: AuditEntry): Promise<void> {
    // create() only — this repository never calls update()/delete() on
    // taxDataAccessLog anywhere, so append-only holds at the application layer
    // (REQ-004.3). No sensitive value is ever part of `entry` (see AuditEntry).
    await this.prisma.taxDataAccessLog.create({ data: entry })
  }
}
