import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PartnerCouplingRecord, PartnerCouplingRepository } from './kopplung.repository.js'

function toRecord(row: {
  id: string
  personAUserId: string
  personBUserId: string
  steuerjahr: number
  veranlagungsart: string
  einladungsCode: string | null
  einladungsCodeGueltigBis: Date | null
}): PartnerCouplingRecord {
  return {
    id: row.id,
    personAUserId: row.personAUserId,
    personBUserId: row.personBUserId,
    steuerjahr: row.steuerjahr,
    veranlagungsart: row.veranlagungsart as 'einzel' | 'zusammen',
    einladungsCode: row.einladungsCode,
    einladungsCodeGueltigBis: row.einladungsCodeGueltigBis,
  }
}

@Injectable()
export class PrismaKopplungRepository implements PartnerCouplingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserAndYear(userId: string, steuerjahr: number): Promise<PartnerCouplingRecord | null> {
    const row = await this.prisma.steuerjahrKopplung.findFirst({
      where: {
        steuerjahr,
        OR: [{ personAUserId: userId }, { personBUserId: userId }],
      },
    })
    return row ? toRecord(row) : null
  }

  async findByEinladungsCode(code: string): Promise<PartnerCouplingRecord | null> {
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
      einladungsCodeGueltigBis?: Date | null
    },
  ): Promise<PartnerCouplingRecord> {
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
          einladungsCodeGueltigBis: data.einladungsCodeGueltigBis ?? null,
        },
        update: {
          personBUserId: data.personBUserId,
          veranlagungsart: data.veranlagungsart,
          ...(data.einladungsCode !== undefined && { einladungsCode: data.einladungsCode }),
          ...(data.einladungsCodeGueltigBis !== undefined && { einladungsCodeGueltigBis: data.einladungsCodeGueltigBis }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return toRecord(row)
  }

  async setPersonB(id: string, personBUserId: string): Promise<PartnerCouplingRecord> {
    const row = await this.prisma.steuerjahrKopplung.update({
      where: { id },
      data: { personBUserId, einladungsCode: null, einladungsCodeGueltigBis: null },
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
