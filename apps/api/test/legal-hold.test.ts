// API-24: the periods of the legal holds are exactly the ones the privacy text prints (RETENTION, P9).
import { RETENTION } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { filingVersionHoldUntil, holdPaidUnlock, holdRefundedUnlock, paymentHoldUntil } from '../src/account/legal-hold.prisma.js'

function fakeHolds() {
  const rows: { id: string; userId: string; resource: string; resourceId: string; reason: string; holdUntil: Date }[] = []
  return {
    rows,
    legalHold: {
      findUnique: async ({ where }: { where: { resource_resourceId: { resource: string; resourceId: string } } }) =>
        rows.find((row) => row.resource === where.resource_resourceId.resource && row.resourceId === where.resource_resourceId.resourceId) ?? null,
      create: async ({ data }: { data: Omit<(typeof rows)[number], 'id'> }) => rows.push({ id: `h${rows.length}`, ...data }),
      update: async ({ where, data }: { where: { id: string }; data: { holdUntil: Date } }) => Object.assign(rows.find((row) => row.id === where.id)!, data),
    },
  }
}

describe('legal hold periods', () => {
  it('a payment is held 8 years from the end of the payment year (§ 147 AO)', () => {
    expect(RETENTION.legalHoldPaymentYears).toBe(8)
    expect(paymentHoldUntil(new Date('2026-03-14T10:00:00Z')).toISOString()).toBe('2035-01-01T00:00:00.000Z')
    expect(paymentHoldUntil(new Date('2026-12-31T22:59:00Z')).toISOString()).toBe('2035-01-01T00:00:00.000Z')
  })

  it('the payment year is the calendar year in Germany, where the books are kept', () => {
    // 23:30 UTC on 31 December is 00:30 on 1 January in Berlin: the payment belongs to 2027.
    expect(paymentHoldUntil(new Date('2026-12-31T23:30:00Z')).toISOString()).toBe('2036-01-01T00:00:00.000Z')
    expect(filingVersionHoldUntil('', new Date('2026-12-31T23:30:00Z')).toISOString()).toBe('2032-01-01T00:00:00.000Z')
  })

  it('a submitted version is held 4 years from the end of the submission year (§ 169, § 170 AO)', () => {
    expect(RETENTION.legalHoldFilingVersionYears).toBe(4)
    expect(filingVersionHoldUntil('2026-05-31', new Date()).toISOString()).toBe('2031-01-01T00:00:00.000Z')
  })

  it('a refund keeps the hold and moves it to the end of the later refund year, never earlier', async () => {
    const db = fakeHolds()
    const unlock = { id: 'u1', userId: 'user-1', paidAt: new Date('2026-12-20T00:00:00Z') }
    await holdPaidUnlock(db as never, unlock, new Date())
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0]).toMatchObject({ resource: 'unlock', resourceId: 'u1', reason: '§ 147 AO, § 257 HGB' })
    await holdRefundedUnlock(db as never, unlock, new Date('2027-01-05T00:00:00Z'))
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0]!.holdUntil.toISOString()).toBe('2036-01-01T00:00:00.000Z')
    // A second payment confirmation (webhook retried) never shortens it.
    await holdPaidUnlock(db as never, unlock, new Date())
    expect(db.rows[0]!.holdUntil.toISOString()).toBe('2036-01-01T00:00:00.000Z')
  })
})
