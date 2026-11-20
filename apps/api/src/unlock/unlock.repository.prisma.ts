import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UnlockRepository, UnlockTier } from './unlock.repository.js'

@Injectable()
export class PrismaUnlockRepository implements UnlockRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOpenOnes(userId: string, taxYear: number, sessionId: string, tier: UnlockTier = 'standard'): Promise<void> {
    await this.prisma.unlock.create({ data: { userId, taxYear, stripeCheckoutSessionId: sessionId, tier } })
  }

  async markPaid(sessionId: string, amountCents: number | null, am: Date): Promise<void> {
    await this.prisma.unlock.updateMany({
      where: { stripeCheckoutSessionId: sessionId, status: 'offen' },
      data: { status: 'bezahlt', amountCents, paidAt: am },
    })
  }

  async isPaid(userId: string, taxYear: number, tier: UnlockTier = 'standard'): Promise<boolean> {
    // The self-employment tier covers the standard one; the standard tier never covers it.
    const count = await this.prisma.unlock.count({ where: { userId, taxYear, status: 'bezahlt', ...(tier === 'selbststaendig' ? { tier: 'selbststaendig' } : {}) } })
    return count > 0
  }
}
