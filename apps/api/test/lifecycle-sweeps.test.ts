// ADR-0030 §6 and H2-7: the lifecycle sweeps with an injected clock. The cases are the ones the ADR says must be
// seen red: a verified account survives, an account inside the period survives, the boundary, the warning goes out
// before the deletion, and an account whose warning was never sent survives (§3a).
import { describe, expect, it, vi } from 'vitest'
import { sweepEndedLegalHolds, sweepUnverifiedAccounts } from '../src/account/lifecycle-sweeps.prisma.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-25T12:00:00Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

interface FakeUser { id: string; email: string; emailVerified: boolean; createdAt: Date; unverifiedWarningSentAt: Date | null; unverifiedFinalWarningSentAt: Date | null }

/** Evaluates exactly the where-clauses the sweep writes: lte/lt/not/null on dates, equality otherwise. */
function matches(user: FakeUser, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = (user as unknown as Record<string, unknown>)[key]
    if (condition === null) return value === null
    if (condition instanceof Object && !(condition instanceof Date)) {
      const c = condition as { lte?: Date; lt?: Date; not?: null; in?: string[] }
      if ('not' in c && value === null) return false
      if (c.lte && !(value instanceof Date && value <= c.lte)) return false
      if (c.lt && !(value instanceof Date && value < c.lt)) return false
      if (c.in && !c.in.includes(value as string)) return false
      return true
    }
    return value === condition
  })
}

function fakeDb(users: FakeUser[]) {
  return {
    user: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => users.filter((user) => matches(user, where)),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeUser> }) => {
        const hit = users.filter((user) => matches(user, where))
        for (const user of hit) Object.assign(user, data)
        return { count: hit.length }
      },
    },
  }
}

const user = (id: string, over: Partial<FakeUser>): FakeUser => ({ id, email: `${id}@example.com`, emailVerified: false, createdAt: ago(40), unverifiedWarningSentAt: null, unverifiedFinalWarningSentAt: null, ...over })

function deps(users: FakeUser[], mailIsDelivered = true) {
  const sent: string[] = []
  const erased: string[] = []
  return {
    sent,
    erased,
    deps: {
      db: fakeDb(users) as never,
      email: { sendUnverifiedAccountWarning: vi.fn(async (mail: { to: string; final: boolean }) => void sent.push(`${mail.final ? 'final' : 'first'}:${mail.to}`)) },
      mailIsDelivered,
      signInUrl: 'https://app.example/login',
      eraseUnverified: async (id: string) => {
        erased.push(id)
        return { deleted: { profile: true, account: true as const }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0, legalHolds: [] }
      },
    },
  }
}

describe('sweepUnverifiedAccounts (ADR-0030)', () => {
  it('a verified account past the deadline survives', async () => {
    const { deps: d, erased, sent } = deps([user('v', { emailVerified: true, unverifiedWarningSentAt: ago(10) })])
    await sweepUnverifiedAccounts(d, NOW)
    expect(erased).toEqual([])
    expect(sent).toEqual([])
  })

  it('an account inside the 30 days survives; the warning goes out from day 23', async () => {
    const { deps: d, erased, sent } = deps([user('young', { createdAt: ago(22) }), user('due', { createdAt: ago(24) })])
    await sweepUnverifiedAccounts(d, NOW)
    expect(sent).toEqual(['first:due@example.com'])
    expect(erased).toEqual([])
  })

  it('§3a: a 40-day-old account whose warning was never sent survives this run and is warned', async () => {
    const users = [user('old', { createdAt: ago(40) })]
    const { deps: d, erased, sent } = deps(users)
    await sweepUnverifiedAccounts(d, NOW)
    expect(erased).toEqual([])
    expect(sent).toEqual(['first:old@example.com'])
    expect(users[0]!.unverifiedWarningSentAt).toEqual(NOW)
  })

  it('deletes only after 30 days and 7 days after the warning; exactly 30 days survives', async () => {
    const { deps: d, erased } = deps([
      user('gone', { createdAt: ago(31), unverifiedWarningSentAt: ago(7), unverifiedFinalWarningSentAt: ago(1) }),
      user('boundary', { createdAt: ago(30), unverifiedWarningSentAt: ago(8), unverifiedFinalWarningSentAt: ago(1) }),
      user('fresh-warning', { createdAt: ago(45), unverifiedWarningSentAt: ago(6), unverifiedFinalWarningSentAt: ago(1) }),
    ])
    await sweepUnverifiedAccounts(d, NOW)
    expect(erased).toEqual(['gone'])
  })

  it('sends the T-1 reminder once, no sooner than 6 days after the first warning', async () => {
    const users = [user('remind', { createdAt: ago(29), unverifiedWarningSentAt: ago(6) }), user('early', { createdAt: ago(29), unverifiedWarningSentAt: ago(2) })]
    const { deps: d, sent } = deps(users)
    await sweepUnverifiedAccounts(d, NOW)
    expect(sent).toEqual(['final:remind@example.com'])
    await sweepUnverifiedAccounts(d, NOW)
    expect(sent).toEqual(['final:remind@example.com'])
  })

  it('activation gate: with mail only logged nothing is deleted', async () => {
    const { deps: d, erased } = deps([user('gone', { createdAt: ago(31), unverifiedWarningSentAt: ago(8) })], false)
    await sweepUnverifiedAccounts(d, NOW)
    expect(erased).toEqual([])
  })

  it('a failed warning is not recorded as sent', async () => {
    const users = [user('due', { createdAt: ago(24) })]
    const { deps: d } = deps(users)
    d.email.sendUnverifiedAccountWarning = vi.fn(async () => {
      throw new Error('provider down')
    })
    await expect(sweepUnverifiedAccounts(d, NOW)).rejects.toThrow('provider down')
    expect(users[0]!.unverifiedWarningSentAt).toBeNull()
  })
})

describe('sweepEndedLegalHolds', () => {
  it('drops ended holds; runs the erasure again only for accounts that are gone', async () => {
    const holds = [
      { id: 'h1', userId: 'deleted-user' },
      { id: 'h2', userId: 'living-user' },
      { id: 'h3', userId: 'spouse_living-user_2025' },
    ]
    const removed: string[] = []
    const db = {
      legalHold: {
        findMany: async () => holds,
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          removed.push(...where.id.in)
          return { count: where.id.in.length }
        },
      },
      user: { findMany: async () => [{ id: 'living-user' }] },
    }
    const erased: string[] = []
    const result = await sweepEndedLegalHolds(db as never, async (id) => {
      erased.push(id)
      return { deleted: { profile: false, account: true }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0, legalHolds: [] }
    }, NOW)
    expect(removed).toEqual(['h1', 'h2', 'h3'])
    expect(erased).toEqual(['deleted-user'])
    expect(result).toEqual({ released: 3, erasedFor: 1 })
  })
})
