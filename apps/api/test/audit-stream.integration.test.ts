// Keyset pagination of the access log against a real Postgres (ADR-0109): complete, ordered, and
// no row lost or doubled where many share one timestamp.
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { PrismaAuditRepository } from '../src/audit/audit.repository.prisma.js'
import { createDatabaseAdapter } from '../src/config/database-adapter.js'

const prisma = new PrismaClient({ adapter: createDatabaseAdapter() })
const repository = new PrismaAuditRepository(prisma)

describe('PrismaAuditRepository.streamOwnRows', () => {
  afterEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "TaxDataAccessLog"')
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('returns every row once, oldest first, across batches, including rows with the same timestamp', async () => {
    const sameInstant = new Date('2026-02-01T10:00:00.000Z')
    await prisma.taxDataAccessLog.createMany({
      data: [
        ...Array.from({ length: 7 }, (_, i) => ({ userId: 'u-stream', action: 'READ' as const, resource: `same-${i}`, createdAt: sameInstant })),
        ...Array.from({ length: 5 }, (_, i) => ({ userId: 'u-stream', action: 'WRITE' as const, resource: `later-${i}`, createdAt: new Date(sameInstant.getTime() + 1000 * (i + 1)) })),
        { userId: 'someone-else', action: 'READ' as const, resource: 'foreign', createdAt: sameInstant },
        { userId: 'u-stream', action: 'READ' as const, resource: 'after-export', createdAt: new Date('2026-03-01T00:00:00.000Z') },
      ],
    })

    const batches: string[][] = []
    for await (const batch of repository.streamOwnRows('u-stream', { batchSize: 5, before: new Date('2026-02-02T00:00:00.000Z') })) {
      batches.push(batch.map((row) => row.resource))
    }

    expect(batches.map((batch) => batch.length)).toEqual([5, 5, 2])
    const all = batches.flat()
    expect(new Set(all).size).toBe(12)
    expect(all.slice(7)).toEqual(['later-0', 'later-1', 'later-2', 'later-3', 'later-4'])
    expect(all).not.toContain('foreign')
    expect(all).not.toContain('after-export')
  })
})
