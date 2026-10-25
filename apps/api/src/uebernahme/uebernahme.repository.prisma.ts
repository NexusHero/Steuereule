import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { UebernahmeKennzeichnungRecord, UebernahmeRepository } from './uebernahme.repository.js'

function toRecord(row: {
  userId: string
  steuerjahr: number
  vorjahr: number
  postenKey: string
  bestaetigt: boolean
}): UebernahmeKennzeichnungRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    vorjahr: row.vorjahr,
    postenKey: row.postenKey,
    bestaetigt: row.bestaetigt,
  }
}

@Injectable()
export class PrismaUebernahmeRepository implements UebernahmeRepository {
  // The Kennzeichnung carries no encrypted facts (no amounts, no PII beyond userId) — the
  // ENCRYPTED_PRISMA client is used so writes are the same client shape the copied FACT rows use,
  // and so the audit entry below lands in the same transaction family.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, steuerjahr: number): Promise<UebernahmeKennzeichnungRecord[]> {
    const rows = await this.prisma.uebernahmeKennzeichnung.findMany({
      where: { userId, steuerjahr },
      orderBy: { postenKey: 'asc' },
    })
    return rows.map(toRecord)
  }

  async findForUserAndYearAndKey(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null> {
    const row = await this.prisma.uebernahmeKennzeichnung.findUnique({
      where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey } },
    })
    return row === null ? null : toRecord(row)
  }

  async create(userId: string, steuerjahr: number, vorjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.uebernahmeKennzeichnung.create({
        data: { userId, steuerjahr, vorjahr, postenKey, bestaetigt: false },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'uebernahme' },
      }),
    ])
    return toRecord(row)
  }

  async bestaetige(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null> {
    const existing = await this.prisma.uebernahmeKennzeichnung.findUnique({
      where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey } },
    })
    if (existing === null) return null

    const [row] = await this.prisma.$transaction([
      this.prisma.uebernahmeKennzeichnung.update({
        where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey } },
        data: { bestaetigt: true },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'uebernahme' },
      }),
    ])
    return toRecord(row)
  }
}
