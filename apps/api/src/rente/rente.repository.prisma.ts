import { Inject, Injectable } from '@nestjs/common'
import type { PensionFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { PensionRecord, PensionRepository } from './rente.repository.js'

function toRecord(row: {
  userId: string
  steuerjahr: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}): PensionRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    rentenart: row.rentenart,
    jahresbetrag: row.jahresbetrag,
    rentenbeginnJahr: row.rentenbeginnJahr,
    alterBeiRentenbeginn: row.alterBeiRentenbeginn,
  }
}

function feldData(
  feld: PensionFieldId,
  wert: string | null,
): { jahresbetrag?: string | null; rentenbeginnJahr?: string | null; alterBeiRentenbeginn?: string | null } {
  switch (feld) {
    case 'jahresbetrag':
      return { jahresbetrag: wert }
    case 'rentenbeginnJahr':
      return { rentenbeginnJahr: wert }
    case 'alterBeiRentenbeginn':
      return { alterBeiRentenbeginn: wert }
  }
}

@Injectable()
export class PrismaRenteRepository implements PensionRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<PensionRecord | null> {
    const row = await this.prisma.rente.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: PensionFieldId, wert: string | null): Promise<PensionRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.rente.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, rentenart: null, jahresbetrag: null, rentenbeginnJahr: null, alterBeiRentenbeginn: null, ...feldData(feld, wert) },
        update: feldData(feld, wert),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'rente' },
      }),
    ])
    return toRecord(row)
  }

  async setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<PensionRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.rente.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, rentenart: art, jahresbetrag: null, rentenbeginnJahr: null, alterBeiRentenbeginn: null },
        update: { rentenart: art },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'rente' },
      }),
    ])
    return toRecord(row)
  }
}
