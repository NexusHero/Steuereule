import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AuditEntry, AuditLogRow, AuditRepository } from './audit.repository.js'

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.taxDataAccessLog.create({ data: entry })
  }

  async findOwnRows(userId: string, options: { newest?: number } = {}): Promise<AuditLogRow[]> {
    const select = { action: true, resource: true, source: true, createdAt: true } as const
    if (options.newest === undefined) return this.prisma.taxDataAccessLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select })
    const newest = await this.prisma.taxDataAccessLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: options.newest, select })
    // Oldest first again, without Array#reverse (the lint rule wants toReversed, which this lib target lacks).
    return newest.map((_, index) => newest[newest.length - 1 - index]!)
  }
}
