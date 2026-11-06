import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UnlockRepository } from './unlock.repository.js'

@Injectable()
export class PrismaUnlockRepository implements UnlockRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOpenOnes(userId: string, taxYear: number, sessionId: string): Promise<void> {
    await this.prisma.unlock.create({ data: { userId, taxYear, stripeCheckoutSessionId: sessionId } })
  }

  async markPaid(sessionId: string, amountCents: number | null, am: Date): Promise<void> {
    await this.prisma.unlock.updateMany({
      where: { stripeCheckoutSessionId: sessionId, status: 'offen' },
      data: { status: 'bezahlt', amountCents, paidAt: am },
    })
  }

  async isPaid(userId: string, taxYear: number): Promise<boolean> {
    const count = await this.prisma.unlock.count({ where: { userId, taxYear, status: 'bezahlt' } })
    return count > 0
  }
}
