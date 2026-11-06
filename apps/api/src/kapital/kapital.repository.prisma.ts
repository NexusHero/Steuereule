import { Inject, Injectable } from '@nestjs/common'
import type { CapitalFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { CapitalRecord, CapitalRepository, CapitalOwner } from './kapital.repository.js'

function toRecord(row: Omit<CapitalRecord, 'inhaber'> & { inhaber?: string | null }): CapitalRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    kapitalertraege: row.kapitalertraege,
    sparerPauschbetrag: row.sparerPauschbetrag,
    kapitalertragsteuer: row.kapitalertragsteuer,
    solidaritaetszuschlag: row.solidaritaetszuschlag,
    kirchensteuer: row.kirchensteuer,
    inhaber: (row.inhaber ?? null) as CapitalOwner | null,
  }
}

@Injectable()
export class PrismaCapitalRepository implements CapitalRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<CapitalRecord | null> {
    const row = await this.prisma.capital.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: CapitalFieldId, value: string | null): Promise<CapitalRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.capital.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...fieldData(field, value) },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kapital' },
      }),
    ])
    return toRecord(row)
  }

  async setOwner(userId: string, taxYear: number, inhaber: CapitalOwner): Promise<CapitalRecord> {
    const row = await this.prisma.capital.upsert({
      where: { userId_taxYear: { userId, taxYear } },
      create: { userId, taxYear, inhaber },
      update: { inhaber },
    })
    return toRecord(row)
  }
}

function fieldData(field: CapitalFieldId, value: string | null): Partial<Record<CapitalFieldId, string | null>> {
  switch (field) {
    case 'kapitalertraege':
      return { kapitalertraege: value }
    case 'sparerPauschbetrag':
      return { sparerPauschbetrag: value }
    case 'kapitalertragsteuer':
      return { kapitalertragsteuer: value }
    case 'solidaritaetszuschlag':
      return { solidaritaetszuschlag: value }
    case 'kirchensteuer':
      return { kirchensteuer: value }
  }
}
