import { Inject, Injectable } from '@nestjs/common'
import type { BescheidFeld, BescheidStatus } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { BescheidFelder, BescheidRecord, BescheidRepository } from './bescheid.repository.js'

type Row = {
  userId: string
  steuerjahr: number
  status: string
  bescheiddatum: string | null
  einspruchGrund: string | null
  einnahmen: string | null
  vorsorgeaufwand: string | null
  anrechnung: string | null
  festgesetzteSteuer: string | null
  erstattung: string | null
}

function felderAusRow(row: Row): BescheidFelder {
  return {
    einnahmen: row.einnahmen,
    vorsorgeaufwand: row.vorsorgeaufwand,
    anrechnung: row.anrechnung,
    festgesetzteSteuer: row.festgesetzteSteuer,
    erstattung: row.erstattung,
  }
}

function toRecord(row: Row): BescheidRecord {
  // `status` is written only by the service, which validates it against the core's closed
  // BescheidStatus set — a stored value is one by construction; the guard is defence in depth.
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    status: row.status as BescheidStatus,
    bescheiddatum: row.bescheiddatum,
    einspruchGrund: row.einspruchGrund,
    felder: felderAusRow(row),
  }
}

/** The one-keyed update/insert payload for `feld` — typed, never a computed `{[feld]: wert}`. */
function feldData(feld: BescheidFeld, wert: string | null): Partial<Row> {
  switch (feld) {
    case 'einnahmen':
      return { einnahmen: wert }
    case 'vorsorgeaufwand':
      return { vorsorgeaufwand: wert }
    case 'anrechnung':
      return { anrechnung: wert }
    case 'festgesetzteSteuer':
      return { festgesetzteSteuer: wert }
    case 'erstattung':
      return { erstattung: wert }
  }
}

@Injectable()
export class PrismaBescheidRepository implements BescheidRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — the five figures are field-encrypted at rest
  // (ADR-0008): actual income/tax figures are the most sensitive personal facts a tax app holds.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<BescheidRecord | null> {
    const row = await this.prisma.bescheid.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: BescheidFeld, wert: string | null): Promise<BescheidRecord> {
    const [row] = await this.prisma.$transaction([
      // A fresh row seeds the other four figures as null (`offen`) and the status as `eingegangen`
      // — an honest empty mask; the upsert's update branch touches only the field being set.
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: {
          userId,
          steuerjahr,
          status: 'eingegangen',
          ...feldData(feld, wert),
        },
        update: feldData(feld, wert),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<BescheidRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status: 'eingegangen', bescheiddatum: datum },
        update: { bescheiddatum: datum },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<BescheidRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status },
        update: { status },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<BescheidRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status: 'einspruch-eingelegt', einspruchGrund: grund },
        update: { status: 'einspruch-eingelegt', einspruchGrund: grund },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }
}
