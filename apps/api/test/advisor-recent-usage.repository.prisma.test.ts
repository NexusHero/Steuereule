// The owl's model profiles are measured over every user's latest answers. Under row-level security a query
// with the request's identity sees the caller's own answers only, so the profiles were one user's numbers.
// The query runs under its own system reason and selects the usage column only.
import { describe, expect, it } from 'vitest'
import { PrismaAdvisorRepository } from '../src/advisor/advisor.repository.prisma.js'
import { currentDatabaseIdentity, runAsDatabaseUser } from '../src/common/database-identity.js'

describe('PrismaAdvisorRepository.recentUsage', () => {
  it('reads the usage of every user under model-usage-stats, and nothing but the usage column', async () => {
    const seen: unknown[] = []
    const prisma = {
      advisorChatMessage: {
        findMany: (args: { select: Record<string, boolean> }) => {
          seen.push({ identity: currentDatabaseIdentity(), select: args.select })
          return Promise.resolve([{ usageJson: JSON.stringify({ traceId: 't', model: 'm' }) }])
        },
      },
    }
    const repository = new PrismaAdvisorRepository(prisma as never)
    const usage = await runAsDatabaseUser('u1', () => repository.recentUsage(5))
    expect(usage).toEqual([{ traceId: 't', model: 'm' }])
    expect(seen).toEqual([{ identity: { kind: 'system', reason: 'model-usage-stats' }, select: { usageJson: true } }])
  })
})
