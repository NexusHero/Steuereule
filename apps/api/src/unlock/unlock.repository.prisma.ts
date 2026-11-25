import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service.js'
import { holdPaidUnlock, holdRefundedUnlock } from '../personal-data/legal-hold.prisma.js'
import type { SessionOwner } from './payment-provider.js'
import { applyUnlockFact, unlockFactsOf, unlockStatusOf, type UnlockFact } from './unlock-lifecycle.js'
import type { UnlockRepository, UnlockTier } from './unlock.repository.js'

@Injectable()
export class PrismaUnlockRepository implements UnlockRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOpenOnes(userId: string, taxYear: number, sessionId: string, tier: UnlockTier = 'standard'): Promise<void> {
    // The same session handed out twice (two tabs, a retry) is one row.
    await this.prisma.unlock.upsert({
      where: { stripeCheckoutSessionId: sessionId },
      create: { userId, taxYear, stripeCheckoutSessionId: sessionId, tier },
      update: {},
    })
  }

  async openSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<string[]> {
    const rows = await this.prisma.unlock.findMany({
      where: { userId, taxYear, tier, status: 'offen' },
      orderBy: { createdAt: 'desc' },
      select: { stripeCheckoutSessionId: true },
      take: 5,
    })
    return rows.map((row) => row.stripeCheckoutSessionId)
  }

  countSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<number> {
    return this.prisma.unlock.count({ where: { userId, taxYear, tier } })
  }

  markPaid(sessionId: string, amountCents: number | null, am: Date, owner?: SessionOwner): Promise<void> {
    return this.record(sessionId, { kind: 'paid', at: am }, am, owner, amountCents)
  }

  markClosed(sessionId: string, now = new Date()): Promise<void> {
    return this.record(sessionId, { kind: 'closed' }, now)
  }

  revoke(sessionId: string, reason: 'erstattet' | 'angefochten', owner?: SessionOwner, now = new Date()): Promise<void> {
    return this.record(sessionId, reason === 'erstattet' ? { kind: 'refunded', at: now } : { kind: 'disputed' }, now, owner)
  }

  restore(sessionId: string, owner?: SessionOwner, now = new Date()): Promise<void> {
    return this.record(sessionId, { kind: 'dispute-won' }, now, owner)
  }

  /**
   * Stores one fact about the session and the status that follows from all facts, under the row's lock, with
   * the legal hold of a payment in the same transaction (a paid row never exists without its hold). A session
   * without a local row (it could not be written after the session was created, API-4) is rebuilt from `owner`,
   * whichever event comes first: a refund that overtakes the completion must not be lost.
   */
  private async record(sessionId: string, fact: UnlockFact, now: Date, owner?: SessionOwner, amountCents: number | null = null): Promise<void> {
    const once = () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Freischaltung" WHERE "stripeCheckoutSessionId" = ${sessionId} FOR UPDATE`
        let row = await tx.unlock.findUnique({ where: { stripeCheckoutSessionId: sessionId } })
        if (!row) {
          if (!owner) return
          // Only for an account that still exists.
          const user = await tx.user.findUnique({ where: { id: owner.userId }, select: { id: true } })
          if (!user) return
          row = await tx.unlock.create({ data: { userId: owner.userId, taxYear: owner.taxYear, tier: owner.tier, stripeCheckoutSessionId: sessionId } })
        }
        const facts = applyUnlockFact(unlockFactsOf(row), fact)
        await tx.unlock.update({
          where: { id: row.id },
          data: {
            status: unlockStatusOf(facts),
            paidAt: facts.paidAt,
            refundedAt: facts.refundedAt,
            dispute: facts.dispute,
            ...(fact.kind === 'paid' && row.amountCents === null ? { amountCents } : {}),
          },
        })
        // A payment is a Buchungsbeleg and gets its hold (P7); a refund keeps it and may move it later.
        const held = { id: row.id, userId: row.userId, paidAt: facts.paidAt }
        if (facts.refundedAt !== null) await holdRefundedUnlock(tx, held, facts.refundedAt)
        else if (facts.paidAt !== null) await holdPaidUnlock(tx, held, now)
      })
    try {
      await once()
    } catch (error) {
      // Two events rebuilt the same missing row at once: the loser finds it on the second try.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      await once()
    }
  }

  async isPaid(userId: string, taxYear: number, tier: UnlockTier = 'standard'): Promise<boolean> {
    // The self-employment tier covers the standard one; the standard tier never covers it.
    const count = await this.prisma.unlock.count({ where: { userId, taxYear, status: 'bezahlt', ...(tier === 'selbststaendig' ? { tier: 'selbststaendig' } : {}) } })
    return count > 0
  }
}
