import type { PaymentProvider, SessionOwner } from '../../src/unlock/payment-provider.js'
import type { UnlockRepository, UnlockRowStatus, UnlockTier } from '../../src/unlock/unlock.repository.js'

export interface FakeUnlockRow {
  userId: string
  taxYear: number
  sessionId: string
  status: UnlockRowStatus
  tier: UnlockTier
  amountCents: number | null
}

/** In-memory twin of PrismaUnlockRepository with the same transitions (see UnlockRowStatus). */
export class FakeUnlockRepository implements UnlockRepository {
  rows: FakeUnlockRow[] = []
  /** Set to make the next createOpenOnes fail, as a database outage after the Stripe session would. */
  failNextCreate = false
  /** Accounts that exist; a rebuilt row needs its user (the real table has a foreign key). */
  users = new Set<string>(['u1', 'u2'])

  async createOpenOnes(userId: string, taxYear: number, sessionId: string, tier: UnlockTier = 'standard'): Promise<void> {
    if (this.failNextCreate) {
      this.failNextCreate = false
      throw new Error('database unavailable')
    }
    if (this.rows.some((row) => row.sessionId === sessionId)) return
    this.rows.push({ userId, taxYear, sessionId, status: 'offen', tier, amountCents: null })
  }

  async openSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<string[]> {
    const open = this.rows.filter((row) => row.userId === userId && row.taxYear === taxYear && row.tier === tier && row.status === 'offen')
    // Newest first, as the real repository orders by creation.
    return open.map((_, i) => open[open.length - 1 - i]!.sessionId)
  }

  async countSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<number> {
    return this.rows.filter((row) => row.userId === userId && row.taxYear === taxYear && row.tier === tier).length
  }

  async markPaid(sessionId: string, amountCents: number | null, _am: Date, owner?: SessionOwner): Promise<void> {
    const row = this.rows.find((r) => r.sessionId === sessionId)
    if (row) {
      if (row.status === 'offen' || row.status === 'abgelaufen') Object.assign(row, { status: 'bezahlt', amountCents })
      return
    }
    if (owner && this.users.has(owner.userId)) {
      this.rows.push({ userId: owner.userId, taxYear: owner.taxYear, sessionId, status: 'bezahlt', tier: owner.tier, amountCents })
    }
  }

  async markClosed(sessionId: string): Promise<void> {
    for (const row of this.rows) if (row.sessionId === sessionId && row.status === 'offen') row.status = 'abgelaufen'
  }

  async revoke(sessionId: string, reason: 'erstattet' | 'angefochten'): Promise<void> {
    for (const row of this.rows) {
      if (row.sessionId !== sessionId) continue
      if (row.status === 'bezahlt' || (reason === 'erstattet' && row.status === 'angefochten')) row.status = reason
    }
  }

  async restore(sessionId: string): Promise<void> {
    for (const row of this.rows) if (row.sessionId === sessionId && row.status === 'angefochten') row.status = 'bezahlt'
  }

  async isPaid(userId: string, taxYear: number, tier: UnlockTier = 'standard'): Promise<boolean> {
    return this.rows.some((r) => r.userId === userId && r.taxYear === taxYear && r.status === 'bezahlt' && (tier === 'standard' || r.tier === 'selbststaendig'))
  }
}

/** A repository that answers every year as paid or as unpaid; for tests that only need the gate. */
export function fixedUnlockRepository(paid: boolean): UnlockRepository {
  const repository = new FakeUnlockRepository()
  repository.isPaid = async () => paid
  return repository
}

/** A provider whose checkout always hands out `sessionId` and whose events always pay it. */
export function stubPaymentProvider(sessionId = 'cs_1', url = 'https://example.test'): PaymentProvider {
  return {
    createCheckout: async () => ({ id: sessionId, url }),
    lookupCheckout: async () => ({ state: 'open', url }),
    priceOf: async () => ({ amountCents: 3499, currency: 'eur' }),
    verifyEvent: async () => ({ kind: 'bezahlt', sessionId, amountCents: 3900 }),
  }
}
