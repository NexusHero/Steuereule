import { Inject, Injectable } from '@nestjs/common'
import type { WageTaxCertificateFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { LstbLinePatch, WageTaxCertificateChurchTax, WageTaxCertificateRecord, WageTaxCertificateRepository } from './lstb.repository.js'

function toRecord(row: {
  userId: string
  taxYear: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
  kirchensteuer?: string | null
  kirchensteuerEhegatte?: string | null
  zuschuesseKvPv?: string | null
  rvArbeitnehmer?: string | null
  rvArbeitgeber?: string | null
  kvArbeitnehmer?: string | null
  pvArbeitnehmer?: string | null
  avArbeitnehmer?: string | null
  zuschussPv?: string | null
  solidaritaetszuschlag?: string | null
  arbeitgeber?: string | null
}): WageTaxCertificateRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    bruttoarbeitslohn: row.bruttoarbeitslohn,
    lohnsteuer: row.lohnsteuer,
    sozialversicherung: row.sozialversicherung,
    kirchensteuer: row.kirchensteuer ?? null,
    kirchensteuerEhegatte: row.kirchensteuerEhegatte ?? null,
    zuschuesseKvPv: row.zuschuesseKvPv ?? null,
    rvArbeitnehmer: row.rvArbeitnehmer ?? null,
    rvArbeitgeber: row.rvArbeitgeber ?? null,
    kvArbeitnehmer: row.kvArbeitnehmer ?? null,
    pvArbeitnehmer: row.pvArbeitnehmer ?? null,
    avArbeitnehmer: row.avArbeitnehmer ?? null,
    zuschussPv: row.zuschussPv ?? null,
    solidaritaetszuschlag: row.solidaritaetszuschlag ?? null,
    arbeitgeber: row.arbeitgeber ?? null,
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

  async setEmployer(userId: string, taxYear: number, arbeitgeber: string | null): Promise<WageTaxCertificateRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, arbeitgeber },
        update: { arbeitgeber },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'lstb' } }),
    ])
    return toRecord(row)
  }

  async setSubsidies(userId: string, taxYear: number, zuschuesseKvPv: string | null): Promise<WageTaxCertificateRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, zuschuesseKvPv },
        update: { zuschuesseKvPv },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'lstb' } }),
    ])
    return toRecord(row)
  }

  async setLines(userId: string, taxYear: number, lines: LstbLinePatch): Promise<WageTaxCertificateRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, ...lines },
        update: lines,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'lstb' } }),
    ])
    return toRecord(row)
  }

  async setChurchTax(userId: string, taxYear: number, values: WageTaxCertificateChurchTax): Promise<WageTaxCertificateRecord> {
    const data = { kirchensteuer: values.kirchensteuer, kirchensteuerEhegatte: values.kirchensteuerEhegatte }
    const [row] = await this.prisma.$transaction([
      this.prisma.lstb.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'lstb' } }),
    ])
    return toRecord(row)
  }
}
