import { Inject, Injectable } from '@nestjs/common'
import type { LstbFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { LstbRecord, LstbRepository } from './lstb.repository.js'

/** The persisted-facts record, narrowed to what the service needs (the three nullable strings). */
function toRecord(row: {
  userId: string
  steuerjahr: number
  bruttoarbeitslohn: string | null
  lohnsteuer: string | null
  sozialversicherung: string | null
}): LstbRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    bruttoarbeitslohn: row.bruttoarbeitslohn,
    lohnsteuer: row.lohnsteuer,
    sozialversicherung: row.sozialversicherung,
  }
}

/** The one-keyed update/insert payload for `feld` — typed, never a computed `{[feld]: wert}`. */
function feldData(
  feld: LstbFeldId,
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
export class PrismaLstbRepository implements LstbRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — the three figures are field-encrypted at
  // rest (ADR-0008): actual income is the most sensitive personal fact a tax app holds,
  // joinable to Profile's Steuer-ID via the same userId (see schema.prisma's Lstb doc).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<LstbRecord | null> {
    const row = await this.prisma.lstb.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, wert: string | null): Promise<LstbRecord> {
    const [row] = await this.prisma.$transaction([
      // A fresh row seeds the other two fields as null (`offen`) — an honest empty mask,
      // never a fabricated figure; the upsert's update branch touches only the field being
      // set, so a prior partial mask is never clobbered.
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
