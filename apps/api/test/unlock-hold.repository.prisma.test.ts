import { describe, expect, it } from 'vitest'
import { PrismaUnlockRepository } from '../src/unlock/unlock.repository.prisma.js'

/**
 * API-24 (decision 2): a paid unlock has its legal hold. The status and the hold are two writes; Stripe repeats an
 * event until it is answered, so the repeated event must finish what the first delivery left undone.
 */
function database(options: { failHoldOnce?: boolean } = {}) {
  const unlock = { id: 'u1', userId: 'user-1', stripeCheckoutSessionId: 'cs_1', status: 'offen', paidAt: null as Date | null }
  const holds: { id: string; resource: string; resourceId: string; holdUntil: Date }[] = []
  let failHold = options.failHoldOnce === true
  const prisma = {
    unlock: {
      updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: Partial<typeof unlock> }) => {
        if (!where.status.in.includes(unlock.status)) return { count: 0 }
        Object.assign(unlock, data)
        return { count: 1 }
      },
      findUnique: async () => unlock,
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
  return { unlock, holds, repository: new PrismaUnlockRepository(prisma as never) }
}

describe('PrismaUnlockRepository: the hold of a payment', () => {
  it('a confirmed payment gets its hold', async () => {
    const { repository, holds } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))
    expect(holds.map((hold) => hold.holdUntil.toISOString())).toEqual(['2035-01-01T00:00:00.000Z'])
  })

  it('the repeated event creates the hold the first delivery failed to write', async () => {
    const { repository, holds, unlock } = database({ failHoldOnce: true })
    await expect(repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))).rejects.toThrow('connection lost')
    expect(unlock.status).toBe('bezahlt')
    expect(holds).toEqual([])
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:05Z'))
    expect(holds).toHaveLength(1)
  })

  it('the repeated refund event moves the hold the first delivery failed to move', async () => {
    const { repository, holds, unlock } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2020-03-10T10:00:00Z'))
    expect(holds[0]!.holdUntil.toISOString()).toBe('2029-01-01T00:00:00.000Z')
    unlock.status = 'erstattet' // the first delivery changed the status and failed before the hold
    await repository.revoke('cs_1', 'erstattet')
    expect(holds[0]!.holdUntil.getTime()).toBeGreaterThan(new Date('2029-01-01T00:00:00Z').getTime())
  })

  it('a dispute leaves the hold as it is', async () => {
    const { repository, holds } = database()
    await repository.markPaid('cs_1', 2_900, new Date('2026-03-10T10:00:00Z'))
    await repository.revoke('cs_1', 'angefochten')
    expect(holds.map((hold) => hold.holdUntil.toISOString())).toEqual(['2035-01-01T00:00:00.000Z'])
  })
})
