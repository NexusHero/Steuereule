import { Inject, Injectable } from '@nestjs/common'
import type { PensionFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { PensionRecord, PensionRepository } from './pension.repository.js'

function toRecord(row: {
  userId: string
  taxYear: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}): PensionRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    rentenart: row.rentenart,
    jahresbetrag: row.jahresbetrag,
    rentenbeginnJahr: row.rentenbeginnJahr,
    alterBeiRentenbeginn: row.alterBeiRentenbeginn,
  }
}

function fieldData(
  field: PensionFieldId,
  value: string | null,
): { jahresbetrag?: string | null; rentenbeginnJahr?: string | null; alterBeiRentenbeginn?: string | null } {
  switch (field) {
    case 'jahresbetrag':
      return { jahresbetrag: value }
    case 'rentenbeginnJahr':
      return { rentenbeginnJahr: value }
    case 'alterBeiRentenbeginn':
      return { alterBeiRentenbeginn: value }
  }
}

@Injectable()
export class PrismaPensionRepository implements PensionRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<PensionRecord | null> {
    const row = await this.prisma.pension.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: PensionFieldId, value: string | null): Promise<PensionRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.pension.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, rentenart: null, jahresbetrag: null, rentenbeginnJahr: null, alterBeiRentenbeginn: null, ...fieldData(field, value) },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'rente' },
      }),
    ])
    return toRecord(row)
  }

  async setPensionKind(userId: string, taxYear: number, kind: string | null): Promise<PensionRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.pension.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, rentenart: kind, jahresbetrag: null, rentenbeginnJahr: null, alterBeiRentenbeginn: null },
        update: { rentenart: kind },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'rente' },
      }),
    ])
    return toRecord(row)
  }
}
