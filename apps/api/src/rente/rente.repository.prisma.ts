import { Inject, Injectable } from '@nestjs/common'
import type { RentenFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { RenteRecord, RenteRepository } from './rente.repository.js'

function toRecord(row: {
  userId: string
  steuerjahr: number
  rentenart: string | null
  jahresbetrag: string | null
  rentenbeginnJahr: string | null
  alterBeiRentenbeginn: string | null
}): RenteRecord {
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
  feld: RentenFeldId,
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
export class PrismaRenteRepository implements RenteRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<RenteRecord | null> {
    const row = await this.prisma.rente.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, wert: string | null): Promise<RenteRecord> {
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

  async setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<RenteRecord> {
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
