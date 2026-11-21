import { describe, expect, it } from 'vitest'
import { receiptPageWhere } from '../src/receipt/receipt.repository.prisma.js'

// Review of e52771f4: the folder "weitere" filters with an OR, the keyset cursor too. Spread into one
// object, the cursor's OR replaced the folder's, so page 2 of "weitere" listed Belege of every folder.
describe('receiptPageWhere', () => {
  const after = { createdAt: new Date('2026-11-20T10:00:00.000Z'), id: 'beleg-5' }

  it('keeps the folder filter and the cursor side by side', () => {
    const where = receiptPageWhere('u1', { limit: 30, folder: 'weitere', after })
    expect(where).toEqual({
      userId: 'u1',
      AND: [
        { OR: [{ kind: null }, { kind: { notIn: expect.any(Array) } }] },
        { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] },
      ],
    })
  })

  it('needs neither when the first page of all Belege is asked for', () => {
    expect(receiptPageWhere('u1', { limit: 30 })).toEqual({ userId: 'u1', AND: [] })
  })
})
