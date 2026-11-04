import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { TaxYearRecord, TaxYearRepository } from './tax-year.repository.js'

@Injectable()
export class PrismaTaxYearRepository implements TaxYearRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRecord | null> {
    const row = await this.prisma.taxYear.findUnique({
      where: { userId_steuerjahr: { userId, steuerjahr } },
    })
    if (!row) return null
    return {
      steuerjahr: row.steuerjahr,
      openItems: row.openItems,
    }
  }
}
