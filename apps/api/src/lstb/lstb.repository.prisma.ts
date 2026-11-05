import { Inject, Injectable } from '@nestjs/common'
import type { WageTaxCertificateFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { WageTaxCertificateRecord, WageTaxCertificateRepository } from './lstb.repository.js'

function toRecord(row: {
  userId: string
  steuerjahr: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}): WageTaxCertificateRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    bruttoarbeitslohn: row.bruttoarbeitslohn,
    lohnsteuer: row.lohnsteuer,
    sozialversicherung: row.sozialversicherung,
  }
}

function feldData(
  feld: WageTaxCertificateFieldId,
  wert: string | null,
): { bruttoarbeitslohn?: string | null; lohnsteuer?: string | null; sozialversicherung?: string | null } {
  switch (feld) {
    case 'bruttoarbeitslohn':
      return { bruttoarbeitslohn: wert }
    case 'lohnsteuer':
      return { lohnsteuer: wert }
    case 'sozialversicherung':
      return { sozialversicherung: wert }
  }
}

@Injectable()
export class PrismaLstbRepository implements WageTaxCertificateRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<WageTaxCertificateRecord | null> {
    const row = await this.prisma.lstb.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: WageTaxCertificateFieldId, value: string | null): Promise<WageTaxCertificateRecord> {
    return this.setFeld(userId, taxYear, field, value)
  }

  async setFeld(userId: string, steuerjahr: number, feld: WageTaxCertificateFieldId, wert: string | null): Promise<WageTaxCertificateRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, ...feldData(feld, wert) },
        update: feldData(feld, wert),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'lstb' },
      }),
    ])
    return toRecord(row)
  }
}
