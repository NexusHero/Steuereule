import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { personIds } from '../common/person-ids.js'
import type { AuditEntry, AuditLogRow, AuditRepository } from './audit.repository.js'

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.taxDataAccessLog.create({ data: entry })
  }

  /**
   * The person's rows are the ones under their id and under the shadow ids of a Person B they keep (H2-15): a
   * read or write of B's figures is logged under B's shadow id, which has no login and no export of its own.
   */
  private own(userId: string): { userId: { in: string[] } } {
    return { userId: { in: personIds(userId) } }
  }

  async findOwnRows(userId: string, options: { newest?: number } = {}): Promise<AuditLogRow[]> {
    const select = { action: true, resource: true, source: true, createdAt: true } as const
    if (options.newest === undefined) return this.prisma.taxDataAccessLog.findMany({ where: this.own(userId), orderBy: { createdAt: 'asc' }, select })
    const newest = await this.prisma.taxDataAccessLog.findMany({ where: this.own(userId), orderBy: { createdAt: 'desc' }, take: options.newest, select })
    // Oldest first again, without Array#reverse (the lint rule wants toReversed, which this lib target lacks).
    return newest.map((_, index) => newest[newest.length - 1 - index]!)
  }

  async lastSeenBySource(userId: string, sources: readonly string[]): Promise<Map<string, Date>> {
    // One grouped query over the index (userId, source, createdAt), not a scan of the user's whole log.
    const rows = await this.prisma.taxDataAccessLog.groupBy({ by: ['source'], where: { userId, source: { in: [...sources] } }, _max: { createdAt: true } })
    return new Map(rows.flatMap((row) => (row.source !== null && row._max.createdAt !== null ? [[row.source, row._max.createdAt] as const] : [])))
  }

  async *streamOwnRows(userId: string, options: { batchSize: number; before: Date }): AsyncGenerator<AuditLogRow[]> {
    let after: { createdAt: Date; id: string } | undefined
    for (;;) {
      const page = await this.prisma.taxDataAccessLog.findMany({
        where: {
          ...this.own(userId),
          createdAt: { lt: options.before },
          ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: options.batchSize,
        select: { id: true, action: true, resource: true, source: true, createdAt: true },
      })
      if (page.length === 0) return
      const last = page[page.length - 1]!
      after = { createdAt: last.createdAt, id: last.id }
      yield page.map(({ action, resource, source, createdAt }) => ({ action, resource, source, createdAt }))
      if (page.length < options.batchSize) return
    }
  }
}
