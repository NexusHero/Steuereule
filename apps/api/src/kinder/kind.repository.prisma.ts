import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { KindRecord, KindRepository } from './kind.repository.js'

function toRecord(row: {
  id: string
  userId: string
  steuerjahr: number
  lfdNr: number
  vorname: string
  nachname: string
  geburtsdatum: string
  idnr: string | null
  kindergeldAnspruchEur: string | null
}): KindRecord {
  return {
    id: row.id,
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    lfdNr: row.lfdNr,
    vorname: row.vorname,
    nachname: row.nachname,
    geburtsdatum: row.geburtsdatum,
    idnr: row.idnr,
    kindergeldAnspruchEur: row.kindergeldAnspruchEur,
  }
}

@Injectable()
export class PrismaKindRepository implements KindRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, steuerjahr: number): Promise<KindRecord[]> {
    const rows = await this.prisma.kind.findMany({
      where: { userId, steuerjahr },
      orderBy: { lfdNr: 'asc' },
    })
    return rows.map(toRecord)
  }

  async create(
    userId: string,
    steuerjahr: number,
    data: {
      vorname: string
      nachname: string
      geburtsdatum: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    },
  ): Promise<KindRecord> {
    const count = await this.prisma.kind.count({ where: { userId, steuerjahr } })
    const [row] = await this.prisma.$transaction([
      this.prisma.kind.create({
        data: {
          userId,
          steuerjahr,
          lfdNr: count + 1,
          vorname: data.vorname,
          nachname: data.nachname,
          geburtsdatum: data.geburtsdatum,
          idnr: data.idnr ?? null,
          kindergeldAnspruchEur: data.kindergeldAnspruchEur ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return toRecord(row)
  }

  async update(
    userId: string,
    steuerjahr: number,
    id: string,
    data: {
      vorname?: string
      nachname?: string
      geburtsdatum?: string
      idnr?: string | null
      kindergeldAnspruchEur?: string | null
    },
  ): Promise<KindRecord | null> {
    const existing = await this.prisma.kind.findFirst({ where: { id, userId, steuerjahr } })
    if (existing === null) return null

    const updateData: Record<string, string | null> = {}
    if (data.vorname !== undefined) updateData.vorname = data.vorname
    if (data.nachname !== undefined) updateData.nachname = data.nachname
    if (data.geburtsdatum !== undefined) updateData.geburtsdatum = data.geburtsdatum
    if (data.idnr !== undefined) updateData.idnr = data.idnr
    if (data.kindergeldAnspruchEur !== undefined) updateData.kindergeldAnspruchEur = data.kindergeldAnspruchEur

    const [row] = await this.prisma.$transaction([
      this.prisma.kind.update({ where: { id }, data: updateData }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return toRecord(row)
  }

  async delete(userId: string, steuerjahr: number, id: string): Promise<boolean> {
    const existing = await this.prisma.kind.findFirst({ where: { id, userId, steuerjahr } })
    if (existing === null) return false

    await this.prisma.$transaction([
      this.prisma.kind.delete({ where: { id } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return true
  }
}
