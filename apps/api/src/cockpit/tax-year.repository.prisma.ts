import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { TaxYearRecord, TaxYearRepository } from './tax-year.repository.js'

@Injectable()
export class PrismaTaxYearRepository implements TaxYearRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserAndYear(userId: string, taxYear: number): Promise<TaxYearRecord | null> {
    const row = await this.prisma.taxYear.findUnique({
      where: { userId_taxYear: { userId, taxYear } },
    })
    if (!row) return null
    return {
      taxYear: row.taxYear,
      openItems: row.openItems,
    }
  }
}
