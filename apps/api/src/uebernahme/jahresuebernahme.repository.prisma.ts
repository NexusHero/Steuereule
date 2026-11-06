import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { TaxYearRolloverRecord, TaxYearRolloverRepository } from './jahresuebernahme.repository.js'

@Injectable()
export class PrismaYearTakeoverRepository implements TaxYearRolloverRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRolloverRecord | null> {
    return this.prisma.jahresuebernahme.findUnique({
      where: { userId_steuerjahr: { userId, steuerjahr } },
    })
  }

  async record(userId: string, steuerjahr: number, vorjahr: number): Promise<TaxYearRolloverRecord> {
    return this.prisma.jahresuebernahme.create({
      data: { userId, steuerjahr, vorjahr },
    })
  }

  async deleteForUser(userId: string): Promise<number> {
    const res = await this.prisma.jahresuebernahme.deleteMany({ where: { userId } })
    return res.count
  }

  async listForUser(userId: string): Promise<TaxYearRolloverRecord[]> {
    return this.prisma.jahresuebernahme.findMany({
      where: { userId },
      orderBy: { steuerjahr: 'asc' },
    })
  }
}
