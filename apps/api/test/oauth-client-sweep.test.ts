import { describe, expect, it } from 'vitest'
import { sweepUnusedClients, UNUSED_CLIENT_MAX_AGE_DAYS, type SweepAdapter } from '../src/auth/oauth-client-sweep.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-21T12:00:00Z')

interface Client { clientId: string; userId: string | null; createdAt: Date }

function fakeAdapter(clients: Client[], consented: string[]) {
  const deleted: string[] = []
  let scans = 0
  const adapter: SweepAdapter = {
    findMany: async ({ where }) => {
      scans += 1
      const cutoff = where.find((w) => w.field === 'createdAt')?.value as Date
      return clients.filter((c) => c.createdAt < cutoff && !deleted.includes(c.clientId))
    },
    findOne: async ({ where }) => (consented.includes(String(where[0]?.value)) ? { id: 'consent' } : null),
    delete: async ({ where }) => {
      deleted.push(String(where[0]?.value))
    },
  }
  return { adapter, deleted, scans: () => scans }
}

describe('sweepUnusedClients (ADR-0052 amendment 5)', () => {
  const old = new Date(NOW.getTime() - (UNUSED_CLIENT_MAX_AGE_DAYS + 1) * DAY)
  const fresh = new Date(NOW.getTime() - DAY)

  it('removes a self-registered client nobody ever approved, once it is old enough', async () => {
    const { adapter, deleted } = fakeAdapter(
      [
        { clientId: 'stale', userId: null, createdAt: old },
        { clientId: 'approved', userId: null, createdAt: old },
        { clientId: 'young', userId: null, createdAt: fresh },
        { clientId: 'owned', userId: 'user-1', createdAt: old },
      ],
      ['approved'],
    )
    await sweepUnusedClients()(adapter, NOW)
    expect(deleted).toEqual(['stale'])
  })

  it('runs at most once an hour per process, and again after a failure', async () => {
    const { adapter, scans } = fakeAdapter([], [])
    const sweep = sweepUnusedClients()
    await sweep(adapter, NOW)
    await sweep(adapter, new Date(NOW.getTime() + 10 * 60 * 1000))
    expect(scans()).toBe(1)
    await sweep(adapter, new Date(NOW.getTime() + 61 * 60 * 1000))
    expect(scans()).toBe(2)
    const failing = sweepUnusedClients()
    const broken: SweepAdapter = { ...adapter, findMany: async () => { throw new Error('db down') } }
    await expect(failing(broken, NOW)).resolves.toBeUndefined()
    await failing(adapter, NOW)
    expect(scans()).toBe(3)
  })
})
