import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SessionOwner } from './payment-provider.js'
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

  async markPaid(sessionId: string, amountCents: number | null, am: Date, owner?: SessionOwner): Promise<void> {
    // A session that closed in our books can still settle late (an asynchronous payment).
    const updated = await this.prisma.unlock.updateMany({
      where: { stripeCheckoutSessionId: sessionId, status: { in: ['offen', 'abgelaufen'] } },
      data: { status: 'bezahlt', amountCents, paidAt: am },
    })
    if (updated.count > 0 || !owner) return
    const known = await this.prisma.unlock.findUnique({ where: { stripeCheckoutSessionId: sessionId }, select: { id: true } })
    if (known) return
    // The row was never written (API-4): rebuild it from the session's metadata, if the account still exists.
    const user = await this.prisma.user.findUnique({ where: { id: owner.userId }, select: { id: true } })
    if (!user) return
    await this.prisma.unlock.upsert({
      where: { stripeCheckoutSessionId: sessionId },
      create: { userId: owner.userId, taxYear: owner.taxYear, tier: owner.tier, stripeCheckoutSessionId: sessionId, status: 'bezahlt', amountCents, paidAt: am },
      update: {},
    })
  }

  async markClosed(sessionId: string): Promise<void> {
    await this.prisma.unlock.updateMany({ where: { stripeCheckoutSessionId: sessionId, status: 'offen' }, data: { status: 'abgelaufen' } })
  }

  async revoke(sessionId: string, reason: 'erstattet' | 'angefochten'): Promise<void> {
    // A refund also ends a dispute's limbo; a dispute never overrides a refund.
    const from = reason === 'erstattet' ? ['bezahlt', 'angefochten'] : ['bezahlt']
    await this.prisma.unlock.updateMany({ where: { stripeCheckoutSessionId: sessionId, status: { in: from } }, data: { status: reason } })
  }

  async restore(sessionId: string): Promise<void> {
    await this.prisma.unlock.updateMany({ where: { stripeCheckoutSessionId: sessionId, status: 'angefochten' }, data: { status: 'bezahlt' } })
  }

  async isPaid(userId: string, taxYear: number, tier: UnlockTier = 'standard'): Promise<boolean> {
    // The self-employment tier covers the standard one; the standard tier never covers it.
    const count = await this.prisma.unlock.count({ where: { userId, taxYear, status: 'bezahlt', ...(tier === 'selbststaendig' ? { tier: 'selbststaendig' } : {}) } })
    return count > 0
  }
}
