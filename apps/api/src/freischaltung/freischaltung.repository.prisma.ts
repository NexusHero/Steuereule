import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UnlockRepository } from './freischaltung.repository.js'

@Injectable()
export class PrismaUnlockRepository implements UnlockRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOpenOnes(userId: string, steuerjahr: number, sessionId: string): Promise<void> {
    await this.prisma.freischaltung.create({ data: { userId, steuerjahr, stripeCheckoutSessionId: sessionId } })
  }

  async markPaid(sessionId: string, betragCent: number | null, am: Date): Promise<void> {
    await this.prisma.freischaltung.updateMany({
      where: { stripeCheckoutSessionId: sessionId, status: 'offen' },
      data: { status: 'bezahlt', betragCent, bezahltAm: am },
    })
  }

  async isPaid(userId: string, steuerjahr: number): Promise<boolean> {
    const count = await this.prisma.freischaltung.count({ where: { userId, steuerjahr, status: 'bezahlt' } })
    return count > 0
  }
}
