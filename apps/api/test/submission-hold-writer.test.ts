// P11: legal holds are written by system paths only, so a user's request can never remove its own hold. The
// submission's hold of the version in force is such a path: its hold queries carry 'legal-hold' and run on the
// repository's client joined to the user's transaction; the version's own writes stay the user's.
import { describe, expect, it } from 'vitest'
import { currentDatabaseIdentity, runAsDatabaseUser } from '../src/common/database-identity.js'
import { PrismaSubmissionRepository } from '../src/submission/submission.repository.prisma.js'

describe('PrismaSubmissionRepository and the legal hold', () => {
  it('places and releases the hold as the legal-hold path, the version as the user', async () => {
    const seen: { query: string; identity: unknown }[] = []
    const note = (query: string) => seen.push({ query, identity: currentDatabaseIdentity() })
    const tx = {
      filingVersion: {
        findFirst: async () => (note('version.findFirst'), null),
        findMany: async () => (note('version.findMany'), [{ id: 'v-old' }]),
        deleteMany: async () => (note('version.deleteMany'), { count: 1 }),
        create: async () => (note('version.create'), { id: 'v-new', userId: 'u1', submittedOn: '2026-03-14' }),
      },
      taxYear: { update: async () => note('taxYear.update') },
      taxDataAccessLog: { create: async () => note('log.create') },
    }
    const prisma = {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      legalHold: {
        deleteMany: async () => (note('hold.deleteMany'), { count: 1 }),
        findUnique: async () => (note('hold.findUnique'), null),
        create: async () => note('hold.create'),
      },
    }
    const repository = new PrismaSubmissionRepository(prisma as never)
    await runAsDatabaseUser('u1', () =>
      repository.record({ userId: 'u1', taxYear: 2025, filingType: 'einzel', submittedOn: '2026-03-14', positions: {}, estimateAtSubmission: null }),
    )
    const user = { kind: 'user', userId: 'u1' }
    const hold = { kind: 'system', reason: 'legal-hold' }
    expect(seen.filter((s) => s.query.startsWith('hold.')).map((s) => s.identity)).toEqual([hold, hold, hold])
    expect(seen.filter((s) => !s.query.startsWith('hold.')).every((s) => JSON.stringify(s.identity) === JSON.stringify(user))).toBe(true)
  })
})
