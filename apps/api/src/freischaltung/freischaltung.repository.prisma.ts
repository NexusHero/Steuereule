import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { FreischaltungRepository } from './freischaltung.repository.js'

@Injectable()
export class PrismaFreischaltungRepository implements FreischaltungRepository {
  // Plain PrismaService: no tax figures here, nothing to encrypt.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void> {
    await this.prisma.freischaltung.create({ data: { userId, steuerjahr, stripeCheckoutSessionId: sitzungId } })
  }

  async markiereBezahlt(sitzungId: string, betragCent: number | null, am: Date): Promise<void> {
    await this.prisma.freischaltung.updateMany({
      where: { stripeCheckoutSessionId: sitzungId, status: 'offen' },
      data: { status: 'bezahlt', betragCent, bezahltAm: am },
    })
  }

  async istBezahlt(userId: string, steuerjahr: number): Promise<boolean> {
    const count = await this.prisma.freischaltung.count({ where: { userId, steuerjahr, status: 'bezahlt' } })
    return count > 0
  }
}
