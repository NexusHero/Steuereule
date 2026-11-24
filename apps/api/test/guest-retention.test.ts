// Guests are erased 30 days after their last write, through the account-deletion path (ADR-0109).
import { describe, expect, it } from 'vitest'
import type { DeleteAccountResult } from '../src/account/account-deletion.repository.js'
import type { GuestActivityRepository } from '../src/guest/guest-activity.repository.js'
import { GUEST_RETENTION_DAYS, GuestActivityNotes, sweepInactiveGuests } from '../src/guest/guest-retention.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-28T10:00:00Z')
const ERASED: DeleteAccountResult = { deleted: { profile: true, account: true }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0 }

/** A table of clocks that honours what the Prisma repository promises. */
function fakeRepository(rows: Record<string, Date>, accounts: string[] = []): GuestActivityRepository {
  return {
    touch: async (id, at) => void (rows[id] = at),
    dueBefore: async (cutoff, limit) =>
      Object.entries(rows).filter(([, at]) => at < cutoff).sort(([, a], [, b]) => a.getTime() - b.getTime()).slice(0, limit).map(([id]) => id),
    claim: async (id, cutoff, to) => {
      const at = rows[id]
      if (at === undefined || !(at < cutoff)) return false
      rows[id] = to
      return true
    },
    stillClaimed: async (id, to) => rows[id]?.getTime() === to.getTime(),
    restart: async (id, at) => void (rows[id] = at),
    drop: async (id) => void delete rows[id],
    isAccount: async (id) => accounts.includes(id),
  }
}

describe('sweepInactiveGuests', () => {
  it('erases a guest idle for 30 days through the deletion path, and keeps a recent one', async () => {
    const rows = { old: new Date(NOW.getTime() - (GUEST_RETENTION_DAYS + 1) * DAY), recent: new Date(NOW.getTime() - 5 * DAY) }
    const erased: string[] = []
    const result = await sweepInactiveGuests({ repository: fakeRepository(rows), erase: async (id) => (erased.push(id), ERASED) }, NOW)
    expect(erased).toEqual(['old'])
    expect(result).toEqual({ erased: 1, heldBack: 0, failed: 0 })
    expect(Object.keys(rows)).toEqual(['recent'])
  })

  it('keeps a guest who wrote again between the claim and the erasure', async () => {
    const rows: Record<string, Date> = { back: new Date(NOW.getTime() - 40 * DAY) }
    const repository = fakeRepository(rows)
    const claim = repository.claim
    // The guest's write lands right after the sweep claimed the row.
    repository.claim = async (...args) => {
      const got = await claim(...args)
      rows.back = NOW
      return got
    }
    const erase = async () => {
      throw new Error('must not run')
    }
    const result = await sweepInactiveGuests({ repository, erase }, NOW)
    expect(result).toEqual({ erased: 0, heldBack: 0, failed: 0 })
    expect(rows.back).toEqual(NOW)
  })

  it('lets the sweep ride on any request, not only on a guest write', () => {
    const recorder = new GuestActivityNotes(fakeRepository({}))
    let runs = 0
    recorder.afterTouch = () => void (runs += 1)
    recorder.seen()
    expect(runs).toBe(1)
  })

  it('never erases an id that has a User row: it is an account, only its clock row goes', async () => {
    const rows = { acct: new Date(NOW.getTime() - 90 * DAY) }
    const erase = async () => {
      throw new Error('must not run')
    }
    const result = await sweepInactiveGuests({ repository: fakeRepository(rows, ['acct']), erase }, NOW)
    expect(result.erased).toBe(0)
    expect(rows).toEqual({})
  })

  it('keeps what a legal hold keeps and looks again in 30 days', async () => {
    const rows = { held: new Date(NOW.getTime() - 40 * DAY) }
    const result = await sweepInactiveGuests({ repository: fakeRepository(rows), erase: async () => ({ ...ERASED, retainedUnderLegalHold: 3 }) }, NOW)
    expect(result.heldBack).toBe(1)
    expect(rows.held).toEqual(NOW)
  })

  it('retries a failed erasure after an hour instead of in 30 days', async () => {
    const rows = { flaky: new Date(NOW.getTime() - 40 * DAY) }
    const result = await sweepInactiveGuests({ repository: fakeRepository(rows), erase: async () => Promise.reject(new Error('db down')) }, NOW)
    expect(result.failed).toBe(1)
    const later = new Date(NOW.getTime() + 61 * 60 * 1000)
    const retried: string[] = []
    // Not yet due 30 days after the last write, but the claim keeps it due again: it came 40 days ago.
    await sweepInactiveGuests({ repository: fakeRepository(rows), erase: async (id) => (retried.push(id), ERASED) }, later)
    expect(retried).toEqual(['flaky'])
  })

  it('does not erase a guest that another instance has claimed meanwhile', async () => {
    const rows = { one: new Date(NOW.getTime() - 40 * DAY) }
    const repository = fakeRepository(rows)
    const claim = repository.claim
    repository.claim = async (...args) => {
      rows.one = NOW // the other instance (or a fresh write) got there first
      return claim(...args)
    }
    const erased: string[] = []
    await sweepInactiveGuests({ repository, erase: async (id) => (erased.push(id), ERASED) }, NOW)
    expect(erased).toEqual([])
  })
})

describe('GuestActivityNotes', () => {
  it('writes the clock at most once an hour per guest, and hands the sweep a chance each time it writes', async () => {
    const rows: Record<string, Date> = {}
    const recorder = new GuestActivityNotes(fakeRepository(rows))
    let chances = 0
    recorder.afterTouch = () => void (chances += 1)
    const t0 = Date.parse('2026-11-28T10:00:00Z')
    await recorder.touch('g1', t0)
    await recorder.touch('g1', t0 + 60_000)
    await recorder.touch('g1', t0 + 61 * 60_000)
    expect(rows.g1).toEqual(new Date(t0 + 61 * 60_000))
    expect(chances).toBe(2)
  })

  it('does not remember a write that failed', async () => {
    let fail = true
    const recorder = new GuestActivityNotes({ ...fakeRepository({}), touch: async () => { if (fail) throw new Error('down') } })
    await expect(recorder.touch('g1')).rejects.toThrow()
    fail = false
    await expect(recorder.touch('g1')).resolves.toBeUndefined()
  })
})
