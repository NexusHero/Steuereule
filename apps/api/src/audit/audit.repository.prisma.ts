import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AuditEntry, AuditLogRow, AuditRepository } from './audit.repository.js'

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.taxDataAccessLog.create({ data: entry })
  }

  findOwnRows(userId: string): Promise<AuditLogRow[]> {
    return this.prisma.taxDataAccessLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, resource: true, source: true, createdAt: true },
    })
  }
}
