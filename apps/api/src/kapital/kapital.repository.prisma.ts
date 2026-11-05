import { Inject, Injectable } from '@nestjs/common'
import type { CapitalFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { CapitalRecord, CapitalRepository, CapitalOwner } from './kapital.repository.js'

function toRecord(row: Omit<CapitalRecord, 'inhaber'> & { inhaber?: string | null }): CapitalRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    kapitalertraege: row.kapitalertraege,
    sparerPauschbetrag: row.sparerPauschbetrag,
    kapitalertragsteuer: row.kapitalertragsteuer,
    solidaritaetszuschlag: row.solidaritaetszuschlag,
    kirchensteuer: row.kirchensteuer,
    inhaber: (row.inhaber ?? null) as CapitalOwner | null,
  }
}

@Injectable()
export class PrismaKapitalRepository implements CapitalRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<CapitalRecord | null> {
    const row = await this.prisma.kapital.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: CapitalFieldId, value: string | null): Promise<CapitalRecord> {
    return this.setFeld(userId, taxYear, field, value)
  }

  async setFeld(userId: string, steuerjahr: number, feld: CapitalFieldId, wert: string | null): Promise<CapitalRecord> {
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

  async setOwner(userId: string, taxYear: number, owner: CapitalOwner): Promise<CapitalRecord> {
    return this.setInhaber(userId, taxYear, owner)
  }

  async setInhaber(userId: string, steuerjahr: number, inhaber: CapitalOwner): Promise<CapitalRecord> {
    const row = await this.prisma.kapital.upsert({
      where: { userId_steuerjahr: { userId, steuerjahr } },
      create: { userId, steuerjahr, inhaber },
      update: { inhaber },
    })
    return toRecord(row)
  }
}

function feldData(feld: CapitalFieldId, wert: string | null): Partial<Record<CapitalFieldId, string | null>> {
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
