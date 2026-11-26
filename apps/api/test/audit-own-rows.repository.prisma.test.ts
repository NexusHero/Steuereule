import { describe, expect, it } from 'vitest'
import { PrismaAuditRepository } from '../src/audit/audit.repository.prisma.js'

/**
 * H2-15: when Person A reads or writes the figures of a Person B without an account, the row is written under B's
 * shadow id (`spouse_<A>_<year>`). That id has no login and no export, so A's access log has to show those rows.
 */
describe('PrismaAuditRepository: the rows of one person', () => {
  const rows = [
    { id: '1', userId: 'a', action: 'READ', resource: 'profil', source: null, createdAt: new Date('2026-01-01T10:00:00Z') },
    { id: '2', userId: 'spouse_a_2025', action: 'READ', resource: 'lstb', source: null, createdAt: new Date('2026-01-02T10:00:00Z') },
    { id: '3', userId: 'spouse_ab_2025', action: 'READ', resource: 'lstb', source: null, createdAt: new Date('2026-01-03T10:00:00Z') },
    { id: '4', userId: 'b', action: 'READ', resource: 'lstb', source: null, createdAt: new Date('2026-01-04T10:00:00Z') },
  ]
  const prisma = {
    taxDataAccessLog: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) => rows.filter((row) => where.userId.in.includes(row.userId)),
    },
  }
  const repository = new PrismaAuditRepository(prisma as never)

  it('lists the reads of the Person B the account keeps, and of nobody else', async () => {
    expect((await repository.findOwnRows('a')).map((row) => row.resource)).toEqual(['profil', 'lstb'])
    expect(await repository.findOwnRows('b')).toHaveLength(1)
  })

  it('streams the same rows into the export', async () => {
    const streamed: string[] = []
    for await (const page of repository.streamOwnRows('a', { batchSize: 50, before: new Date('2027-01-01T00:00:00Z') })) streamed.push(...page.map((row) => row.resource))
    expect(streamed).toEqual(['profil', 'lstb'])
  })
})
