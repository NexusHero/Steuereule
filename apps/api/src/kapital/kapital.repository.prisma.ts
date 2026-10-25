import { Inject, Injectable } from '@nestjs/common'
import type { KapitalFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { KapitalRecord, KapitalRepository } from './kapital.repository.js'

/** The persisted-facts record, narrowed to what the service needs. */
function toRecord(row: { userId: string; steuerjahr: number; kapitalertraege: string | null }): KapitalRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    kapitalertraege: row.kapitalertraege,
  }
}

@Injectable()
export class PrismaKapitalRepository implements KapitalRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — the figure is field-encrypted at rest
  // (ADR-0008): actual capital income, joinable to Profile's Steuer-ID via the same userId
  // (see schema.prisma's Kapital doc).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null> {
    const row = await this.prisma.kapital.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord> {
    const [row] = await this.prisma.$transaction([
      // A fresh row seeds the field as null (`offen`) — an honest empty mask, never a fabricated
      // figure; the update branch touches only the field being set.
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
}

/** The one-keyed update payload for `feld` — typed, never a computed `{[feld]: wert}`. */
function feldData(feld: KapitalFeldId, wert: string | null): { kapitalertraege?: string | null } {
  switch (feld) {
    case 'kapitalertraege':
      return { kapitalertraege: wert }
  }
}
