import { Inject, Injectable } from '@nestjs/common'
import type { WageTaxCertificateFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { WageTaxCertificateRecord, WageTaxCertificateRepository } from './lstb.repository.js'

function toRecord(row: {
  userId: string
  taxYear: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}): WageTaxCertificateRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    bruttoarbeitslohn: row.bruttoarbeitslohn,
    lohnsteuer: row.lohnsteuer,
    sozialversicherung: row.sozialversicherung,
  }
}

function fieldData(
  field: WageTaxCertificateFieldId,
  value: string | null,
): { bruttoarbeitslohn?: string | null; lohnsteuer?: string | null; sozialversicherung?: string | null } {
  switch (field) {
    case 'bruttoarbeitslohn':
      return { bruttoarbeitslohn: value }
    case 'lohnsteuer':
      return { lohnsteuer: value }
    case 'sozialversicherung':
      return { sozialversicherung: value }
  }
}

@Injectable()
export class PrismaLstbRepository implements WageTaxCertificateRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<WageTaxCertificateRecord | null> {
    const row = await this.prisma.lstb.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: WageTaxCertificateFieldId, value: string | null): Promise<WageTaxCertificateRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, ...fieldData(field, value) },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'lstb' },
      }),
    ])
    return toRecord(row)
  }
}
