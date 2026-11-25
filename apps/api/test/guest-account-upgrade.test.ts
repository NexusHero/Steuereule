// The guest→account takeover and its receipts (API-20). A receipt's row and its file move together or not at
// all: the bytes are encrypted for their owner, so a row that moved without its file is a receipt nobody can
// open. Against an in-memory client whose transactions roll back; the real tables run in
// account-lifecycle.integration.test.ts.
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { GenericEndpointContext } from 'better-auth'
import { createGuestAccountUpgradeHook, upgradeGuestToAccount, type ReceiptFileMover } from '../src/auth/guest-account-upgrade.prisma.js'
import { signGuestSession } from '../src/auth/guest-session.js'
import { GUEST_SESSION_COOKIE } from '../src/auth/user-context.guard.js'

interface State {
  receipts: Record<string, string>
  files: Record<string, string>
}

function fakeDatabase(initial: State) {
  let state = structuredClone(initial)
  const failRowUpdateOf = new Set<string>()
  const empty = { count: async () => 0, updateMany: async () => ({ count: 0 }), findMany: async () => [], create: async () => ({}) }
  const receipt = {
    findMany: async ({ where }: { where: { userId: string } }) => Object.keys(state.receipts).filter((id) => state.receipts[id] === where.userId).sort().map((id) => ({ id })),
    updateMany: async ({ where, data }: { where: { id: string; userId: string }; data: { userId: string } }) => {
      if (failRowUpdateOf.has(where.id)) throw new Error('database unavailable')
      if (state.receipts[where.id] !== where.userId) return { count: 0 }
      state.receipts[where.id] = data.userId
      return { count: 1 }
    },
  }
  const client: unknown = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'receipt') return receipt
        if (prop === '$transaction') {
          return async (work: (tx: unknown) => Promise<unknown>) => {
            const before = structuredClone(state)
            try {
              return await work(client)
            } catch (error) {
              state = before
              throw error
            }
          }
        }
        return empty
      },
    },
  )
  /** Stores the file for its new owner in the same database, as the storage adapter does inside the transaction. */
  const mover = (failing: ReadonlySet<string> = new Set()): ReceiptFileMover => ({
    move: async (_from, to, receiptId) => {
      if (failing.has(receiptId)) throw new Error('the file cannot be decrypted')
      if (receiptId in state.files) state.files[receiptId] = to
    },
  })
  return { prisma: client as PrismaClient, mover, failRowUpdateOf, state: () => state }
}

const GUEST = 'guest-1'
const ACCOUNT = 'account-1'
const twoReceipts = (): State => ({ receipts: { r1: GUEST, r2: GUEST }, files: { r1: GUEST, r2: GUEST } })

describe('guest takeover: receipts', () => {
  it('moves each receipt with its file', async () => {
    const db = fakeDatabase(twoReceipts())
    await expect(upgradeGuestToAccount(db.prisma, GUEST, ACCOUNT, db.mover())).resolves.toEqual({ complete: true, receiptsLeftBehind: [] })
    expect(db.state()).toEqual({ receipts: { r1: ACCOUNT, r2: ACCOUNT }, files: { r1: ACCOUNT, r2: ACCOUNT } })
  })

  it('a receipt whose file cannot be stored for the account stays with the guest as a whole, and the takeover says so', async () => {
    const db = fakeDatabase(twoReceipts())
    const result = await upgradeGuestToAccount(db.prisma, GUEST, ACCOUNT, db.mover(new Set(['r2'])))
    expect(result).toEqual({ complete: false, receiptsLeftBehind: ['r2'] })
    expect(db.state()).toEqual({ receipts: { r1: ACCOUNT, r2: GUEST }, files: { r1: ACCOUNT, r2: GUEST } })
  })

  it('a row that cannot move takes its file back with it', async () => {
    const db = fakeDatabase(twoReceipts())
    db.failRowUpdateOf.add('r1')
    const result = await upgradeGuestToAccount(db.prisma, GUEST, ACCOUNT, db.mover())
    expect(result.receiptsLeftBehind).toEqual(['r1'])
    expect(db.state()).toEqual({ receipts: { r1: GUEST, r2: ACCOUNT }, files: { r1: GUEST, r2: ACCOUNT } })
  })

  it('running it again moves what was left', async () => {
    const db = fakeDatabase(twoReceipts())
    await upgradeGuestToAccount(db.prisma, GUEST, ACCOUNT, db.mover(new Set(['r2'])))
    await expect(upgradeGuestToAccount(db.prisma, GUEST, ACCOUNT, db.mover())).resolves.toMatchObject({ complete: true })
    expect(db.state()).toEqual({ receipts: { r1: ACCOUNT, r2: ACCOUNT }, files: { r1: ACCOUNT, r2: ACCOUNT } })
  })
})

describe('guest takeover: the sign-in hook', () => {
  const secret = 'guest-takeover-test-secret-0123456789abcdef'
  const context = () => {
    const setCookie = vi.fn()
    const getCookie = (name: string) => (name === GUEST_SESSION_COOKIE ? signGuestSession(GUEST, secret) : undefined)
    return { setCookie, context: { getCookie, setCookie } as unknown as GenericEndpointContext }
  }

  it('keeps the guest cookie and reports it while receipts are left, and clears it once the takeover is complete', async () => {
    vi.stubEnv('GUEST_SESSION_SECRET', secret)
    try {
      const db = fakeDatabase(twoReceipts())
      const incomplete = vi.fn()
      const first = context()
      await createGuestAccountUpgradeHook(db.prisma, db.mover(new Set(['r2'])), incomplete)({ userId: ACCOUNT }, first.context)
      expect(first.setCookie).not.toHaveBeenCalled()
      expect(incomplete).toHaveBeenCalledWith({ complete: false, receiptsLeftBehind: ['r2'] })

      const second = context()
      await createGuestAccountUpgradeHook(db.prisma, db.mover(), incomplete)({ userId: ACCOUNT }, second.context)
      expect(second.setCookie).toHaveBeenCalledWith(GUEST_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
      expect(incomplete).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
