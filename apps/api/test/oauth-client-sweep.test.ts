import { describe, expect, it } from 'vitest'
import { sweepUnusedClients, UNUSED_CLIENT_MAX_AGE_DAYS, type SweepAdapter } from '../src/auth/oauth-client-sweep.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-21T12:00:00Z')

interface Client { clientId: string; userId: string | null; createdAt: Date }

function fakeAdapter(clients: Client[], consented: string[]) {
  const deleted: string[] = []
  let scans = 0
  const adapter: SweepAdapter = {
    findMany: async ({ where, limit, offset = 0 }) => {
      scans += 1
      const cutoff = where.find((w) => w.field === 'createdAt')?.value as Date
      const rows = clients
        .filter((c) => c.createdAt < cutoff && !deleted.includes(c.clientId))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(offset)
      return limit === undefined ? rows : rows.slice(0, limit)
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

  // Registration allows 600 an hour from one address (amendment 7): one run must clear more than that.
  it('clears more stale clients in one run than an hour of registrations can add', async () => {
    const stale = Array.from({ length: 1000 }, (_, i) => ({ clientId: `stale-${i}`, userId: null, createdAt: new Date(old.getTime() - i * 1000) }))
    const { adapter, deleted } = fakeAdapter(stale, [])
    await sweepUnusedClients()(adapter, NOW)
    expect(deleted).toHaveLength(1000)
  })

  it('is not stalled by more kept clients than fit in one page', async () => {
    const kept = Array.from({ length: 250 }, (_, i) => ({ clientId: `owned-${i}`, userId: 'user-1', createdAt: new Date(old.getTime() - DAY - i * 1000) }))
    const { adapter, deleted } = fakeAdapter([...kept, { clientId: 'stale', userId: null, createdAt: old }], [])
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
