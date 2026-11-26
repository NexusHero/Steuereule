import { describe, expect, it } from 'vitest'
import { PrismaUnlockRepository } from '../src/unlock/unlock.repository.prisma.js'

/**
 * API-24 (decision 2): a paid unlock has its legal hold. Status and hold are written in one transaction under the
 * row's lock, so a hold that fails rolls the status back with it, and the event Stripe repeats writes both.
 */
function database(options: { failHoldOnce?: boolean } = {}) {
  const unlock = { id: 'u1', userId: 'user-1', stripeCheckoutSessionId: 'cs_1', status: 'offen', paidAt: null as Date | null, refundedAt: null as Date | null, dispute: null as string | null, amountCents: null as number | null }
  const holds: { id: string; resource: string; resourceId: string; holdUntil: Date }[] = []
  let failHold = options.failHoldOnce === true
  const tx = {
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ id: unlock.userId }) },
    unlock: {
      findUnique: async () => ({ ...unlock }),
      update: async ({ data }: { data: Partial<typeof unlock> }) => Object.assign(unlock, data),
    },
    legalHold: {
      findUnique: async () => holds[0] ?? null,
      create: async ({ data }: { data: { resource: string; resourceId: string; holdUntil: Date } }) => {
        if (failHold) {
          failHold = false
          throw new Error('connection lost')
        }
        holds.push({ id: 'h1', ...data })
      },
      update: async ({ data }: { data: { holdUntil: Date } }) => Object.assign(holds[0]!, data),
    },
  }
  const prisma = {
    // A transaction: what it wrote is undone when it throws.
    $transaction: async <T>(work: (client: typeof tx) => Promise<T>): Promise<T> => {
      const before = { unlock: { ...unlock }, holds: holds.map((hold) => ({ ...hold })) }
      try {
        return await work(tx)
      } catch (error) {
        Object.assign(unlock, before.unlock)
        holds.splice(0, holds.length, ...before.holds)
        throw error
      }
    },
  }
  return { unlock, holds, repository: new PrismaUnlockRepository(prisma as never) }
}

describe('PrismaUnlockRepository: the hold of a payment', () => {
  it('a confirmed payment gets its hold', async () => {
    const { repository, holds } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))
    expect(holds.map((hold) => hold.holdUntil.toISOString())).toEqual(['2035-01-01T00:00:00.000Z'])
  })

  it('a hold that fails takes the paid status with it, and the repeated event writes both', async () => {
    const { repository, holds, unlock } = database({ failHoldOnce: true })
    await expect(repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))).rejects.toThrow('connection lost')
    expect(unlock.status).toBe('offen')
    expect(holds).toEqual([])
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:05Z'))
    expect(unlock.status).toBe('bezahlt')
    expect(holds).toHaveLength(1)
  })

  it('a refund keeps the hold and moves it to the end of the refund year when that is later', async () => {
    const { repository, holds } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2020-03-10T10:00:00Z'))
    expect(holds[0]!.holdUntil.toISOString()).toBe('2029-01-01T00:00:00.000Z')
    await repository.revoke('cs_1', { kind: 'erstattet' })
    expect(holds[0]!.holdUntil.getTime()).toBeGreaterThan(new Date('2029-01-01T00:00:00Z').getTime())
  })

  it('a dispute leaves the hold as it is', async () => {
    const { repository, holds } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))
    await repository.revoke('cs_1', { kind: 'angefochten', disputeId: 'dp_1' })
    expect(holds.map((hold) => hold.holdUntil.toISOString())).toEqual(['2035-01-01T00:00:00.000Z'])
  })
})
