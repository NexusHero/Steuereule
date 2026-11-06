import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { TaxYearRolloverRecord, TaxYearRolloverRepository } from './jahresuebernahme.repository.js'

@Injectable()
export class PrismaYearTakeoverRepository implements TaxYearRolloverRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<TaxYearRolloverRecord | null> {
    return this.prisma.yearTakeover.findUnique({
      where: { userId_taxYear: { userId, taxYear } },
    })
  }

  async record(userId: string, taxYear: number, lastYear: number): Promise<TaxYearRolloverRecord> {
    return this.prisma.yearTakeover.create({
      data: { userId, taxYear, lastYear },
    })
  }

  async deleteForUser(userId: string): Promise<number> {
    const res = await this.prisma.yearTakeover.deleteMany({ where: { userId } })
    return res.count
  }

  async listForUser(userId: string): Promise<TaxYearRolloverRecord[]> {
    return this.prisma.yearTakeover.findMany({
      where: { userId },
      orderBy: { taxYear: 'asc' },
    })
  }
}
