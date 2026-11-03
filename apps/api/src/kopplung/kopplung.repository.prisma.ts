import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SteuerjahrKopplungRecord, KopplungRepository } from './kopplung.repository.js'

function toRecord(row: {
  id: string
  personAUserId: string
  personBUserId: string
  steuerjahr: number
  veranlagungsart: string
  einladungsCode: string | null
}): SteuerjahrKopplungRecord {
  return {
    id: row.id,
    personAUserId: row.personAUserId,
    personBUserId: row.personBUserId,
    steuerjahr: row.steuerjahr,
    veranlagungsart: row.veranlagungsart as 'einzel' | 'zusammen',
    einladungsCode: row.einladungsCode,
  }
}

@Injectable()
export class PrismaKopplungRepository implements KopplungRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserAndYear(userId: string, steuerjahr: number): Promise<SteuerjahrKopplungRecord | null> {
    const row = await this.prisma.steuerjahrKopplung.findFirst({
      where: {
        steuerjahr,
        OR: [{ personAUserId: userId }, { personBUserId: userId }],
      },
    })
    return row ? toRecord(row) : null
  }

  async findByEinladungsCode(code: string): Promise<SteuerjahrKopplungRecord | null> {
    const row = await this.prisma.steuerjahrKopplung.findUnique({
      where: { einladungsCode: code },
    })
    return row ? toRecord(row) : null
  }

  async upsert(
    personAUserId: string,
    steuerjahr: number,
    data: {
      personBUserId: string
      veranlagungsart: 'einzel' | 'zusammen'
      einladungsCode?: string | null
    },
  ): Promise<SteuerjahrKopplungRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.steuerjahrKopplung.upsert({
        where: {
          personAUserId_steuerjahr: {
            personAUserId,
            steuerjahr,
          },
        },
        create: {
          personAUserId,
          personBUserId: data.personBUserId,
          steuerjahr,
          veranlagungsart: data.veranlagungsart,
          einladungsCode: data.einladungsCode ?? null,
        },
        update: {
          personBUserId: data.personBUserId,
          veranlagungsart: data.veranlagungsart,
          ...(data.einladungsCode !== undefined && { einladungsCode: data.einladungsCode }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return toRecord(row)
  }

  async setPersonB(id: string, personBUserId: string): Promise<SteuerjahrKopplungRecord> {
    const row = await this.prisma.steuerjahrKopplung.update({
      where: { id },
      data: { personBUserId, einladungsCode: null },
    })
    return toRecord(row)
  }

  async delete(personAUserId: string, steuerjahr: number): Promise<boolean> {
    const existing = await this.prisma.steuerjahrKopplung.findUnique({
      where: {
        personAUserId_steuerjahr: { personAUserId, steuerjahr },
      },
    })
    if (!existing) return false

    await this.prisma.$transaction([
      this.prisma.steuerjahrKopplung.delete({
        where: { id: existing.id },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return true
  }
}
