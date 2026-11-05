import { Inject, Injectable } from '@nestjs/common'
import type { KapitalFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { KapitalRecord, KapitalRepository, KapitalInhaber } from './kapital.repository.js'

function toRecord(row: Omit<KapitalRecord, 'inhaber'> & { inhaber?: string | null }): KapitalRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    kapitalertraege: row.kapitalertraege,
    sparerPauschbetrag: row.sparerPauschbetrag,
    kapitalertragsteuer: row.kapitalertragsteuer,
    solidaritaetszuschlag: row.solidaritaetszuschlag,
    kirchensteuer: row.kirchensteuer,
    inhaber: (row.inhaber ?? null) as KapitalInhaber | null,
  }
}

@Injectable()
export class PrismaKapitalRepository implements KapitalRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null> {
    const row = await this.prisma.kapital.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.kapital.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...feldData(feld, wert) },
        update: feldData(feld, wert),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kapital' },
      }),
    ])
    return toRecord(row)
  }

  async setInhaber(userId: string, steuerjahr: number, inhaber: KapitalInhaber): Promise<KapitalRecord> {
    const row = await this.prisma.kapital.upsert({
      where: { userId_steuerjahr: { userId, steuerjahr } },
      create: { userId, steuerjahr, inhaber },
      update: { inhaber },
    })
    return toRecord(row)
  }
}

function feldData(feld: KapitalFeldId, wert: string | null): Partial<Record<KapitalFeldId, string | null>> {
  switch (feld) {
    case 'kapitalertraege':
      return { kapitalertraege: wert }
    case 'sparerPauschbetrag':
      return { sparerPauschbetrag: wert }
    case 'kapitalertragsteuer':
      return { kapitalertragsteuer: wert }
    case 'solidaritaetszuschlag':
      return { solidaritaetszuschlag: wert }
    case 'kirchensteuer':
      return { kirchensteuer: wert }
  }
}
