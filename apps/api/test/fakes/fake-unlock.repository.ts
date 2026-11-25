import type { PaymentProvider, SessionOwner } from '../../src/unlock/payment-provider.js'
import { applyUnlockFact, unlockFactsOf, unlockStatusOf, type UnlockFact } from '../../src/unlock/unlock-lifecycle.js'
import type { UnlockRepository, UnlockRowStatus, UnlockTier } from '../../src/unlock/unlock.repository.js'

export interface FakeUnlockRow {
  userId: string
  taxYear: number
  sessionId: string
  status: UnlockRowStatus
  tier: UnlockTier
  amountCents: number | null
  paidAt?: Date | null
  refundedAt?: Date | null
  dispute?: string | null
}

/** In-memory twin of PrismaUnlockRepository: the same facts and the same status function (`unlock-lifecycle.ts`). */
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

  async markPaid(sessionId: string, amountCents: number | null, am: Date, owner?: SessionOwner): Promise<void> {
    this.record(sessionId, { kind: 'paid', at: am }, owner, amountCents)
  }

  async markClosed(sessionId: string): Promise<void> {
    this.record(sessionId, { kind: 'closed' })
  }

  async revoke(sessionId: string, reason: 'erstattet' | 'angefochten', owner?: SessionOwner): Promise<void> {
    this.record(sessionId, reason === 'erstattet' ? { kind: 'refunded', at: new Date() } : { kind: 'disputed' }, owner)
  }

  async restore(sessionId: string, owner?: SessionOwner): Promise<void> {
    this.record(sessionId, { kind: 'dispute-won' }, owner)
  }

  private record(sessionId: string, fact: UnlockFact, owner?: SessionOwner, amountCents: number | null = null): void {
    let row = this.rows.find((r) => r.sessionId === sessionId)
    if (!row) {
      if (!owner || !this.users.has(owner.userId)) return
      row = { userId: owner.userId, taxYear: owner.taxYear, sessionId, status: 'offen', tier: owner.tier, amountCents: null }
      this.rows.push(row)
    }
    const facts = applyUnlockFact(unlockFactsOf({ status: row.status, paidAt: row.paidAt ?? null, refundedAt: row.refundedAt ?? null, dispute: row.dispute ?? null }), fact)
    Object.assign(row, { status: unlockStatusOf(facts), paidAt: facts.paidAt, refundedAt: facts.refundedAt, dispute: facts.dispute })
    if (fact.kind === 'paid' && row.amountCents === null) row.amountCents = amountCents
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
