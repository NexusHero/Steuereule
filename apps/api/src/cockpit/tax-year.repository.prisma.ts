import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { TaxYearRecord, TaxYearRepository } from './tax-year.repository.js'

@Injectable()
export class PrismaTaxYearRepository implements TaxYearRepository {
  // ENCRYPTED_PRISMA rather than the plain PrismaService — same reasoning as
  // PrismaAuditRepository: it's the one shared, already-connected client every
  // repository injects, and the field-encryption extension adds no models/changes no
  // method signatures for tables (like this one) that declare no `/// @encrypted`
  // field, so there is no downside to reusing it instead of a second client instance.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRecord | null> {
    const row = await this.prisma.taxYear.findUnique({
      where: { userId_steuerjahr: { userId, steuerjahr } },
    })
    if (!row) return null
    return {
      steuerjahr: row.steuerjahr,
      baseEstimate: row.baseEstimate,
      openItems: row.openItems,
      openConflicts: row.openConflicts,
    }
  }
}
