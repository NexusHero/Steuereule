import { Inject, Injectable } from '@nestjs/common'
import { isBelegart } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { BelegRecord, BelegRepository, CreateBelegData, SetZuordnungData } from './beleg.repository.js'

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function toRecord(row: {
  id: string
  userId: string
  dateiname: string
  art: string | null
  belegdatum: Date | null
  zahlungsdatum: Date | null
  steuerjahr: number | null
  vorschlagVerworfen: boolean
  createdAt: Date
  updatedAt: Date
}): BelegRecord {
  return {
    id: row.id,
    userId: row.userId,
    dateiname: row.dateiname,
    ...(row.art !== null ? { art: (isBelegart(row.art) ? row.art : (() => { throw new Error(`corrupt Beleg.art: ${row.art}`) })()) } : {}),
    ...(row.belegdatum !== null ? { belegdatum: toIsoDate(row.belegdatum) } : {}),
    ...(row.zahlungsdatum !== null ? { zahlungsdatum: toIsoDate(row.zahlungsdatum) } : {}),
    steuerjahr: row.steuerjahr,
    vorschlagVerworfen: row.vorschlagVerworfen,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function fromIsoDate(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`not a valid date: ${value}`)
  return date
}

@Injectable()
export class PrismaBelegRepository implements BelegRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<BelegRecord[]> {
    const rows = await this.prisma.beleg.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
    return rows.map(toRecord)
  }

  async findByIdForUser(userId: string, id: string): Promise<BelegRecord | null> {
    const row = await this.prisma.beleg.findFirst({ where: { id, userId } })
    return row === null ? null : toRecord(row)
  }

  async create(userId: string, data: CreateBelegData): Promise<BelegRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.beleg.create({
        data: {
          userId,
          dateiname: data.dateiname,
          ...(data.art !== undefined ? { art: data.art } : {}),
          ...(data.belegdatum !== undefined ? { belegdatum: fromIsoDate(data.belegdatum) } : {}),
          ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: fromIsoDate(data.zahlungsdatum) } : {}),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(row)
  }

  async setZuordnung(userId: string, id: string, data: SetZuordnungData): Promise<BelegRecord | null> {
    const row = await this.prisma.beleg.findFirst({ where: { id, userId } })
    if (row === null) return null

    const [updated] = await this.prisma.$transaction([
      this.prisma.beleg.update({
        where: { id },
        data: { steuerjahr: data.steuerjahr, vorschlagVerworfen: data.vorschlagVerworfen },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(updated)
  }
}
