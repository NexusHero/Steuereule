import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PartnerCouplingRecord, PartnerCouplingRepository } from './kopplung.repository.js'

function toRecord(row: {
  id: string
  personAUserId: string
  personBUserId: string
  taxYear: number
  filingType: string
  invitationCode: string | null
  invitationCodeValidUntil: Date | null
}): PartnerCouplingRecord {
  return {
    id: row.id,
    personAUserId: row.personAUserId,
    personBUserId: row.personBUserId,
    taxYear: row.taxYear,
    filingType: row.filingType as 'einzel' | 'zusammen',
    invitationCode: row.invitationCode,
    invitationCodeValidUntil: row.invitationCodeValidUntil,
  }
}

@Injectable()
export class PrismaLinkRepository implements PartnerCouplingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserAndYear(userId: string, taxYear: number): Promise<PartnerCouplingRecord | null> {
    const row = await this.prisma.taxYearLink.findFirst({
      where: {
        taxYear,
        OR: [{ personAUserId: userId }, { personBUserId: userId }],
      },
    })
    return row ? toRecord(row) : null
  }

  async findByInvitationCode(code: string): Promise<PartnerCouplingRecord | null> {
    const row = await this.prisma.taxYearLink.findUnique({
      where: { invitationCode: code },
    })
    return row ? toRecord(row) : null
  }

  async upsert(
    personAUserId: string,
    taxYear: number,
    data: {
      personBUserId: string
      filingType: 'einzel' | 'zusammen'
      invitationCode?: string | null
      invitationCodeValidUntil?: Date | null
    },
  ): Promise<PartnerCouplingRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.taxYearLink.upsert({
        where: {
          personAUserId_taxYear: {
            personAUserId,
            taxYear,
          },
        },
        create: {
          personAUserId,
          personBUserId: data.personBUserId,
          taxYear,
          filingType: data.filingType,
          invitationCode: data.invitationCode ?? null,
          invitationCodeValidUntil: data.invitationCodeValidUntil ?? null,
        },
        update: {
          personBUserId: data.personBUserId,
          filingType: data.filingType,
          ...(data.invitationCode !== undefined && { einladungsCode: data.invitationCode }),
          ...(data.invitationCodeValidUntil !== undefined && { einladungsCodeGueltigBis: data.invitationCodeValidUntil }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return toRecord(row)
  }

  async setPersonB(id: string, personBUserId: string): Promise<PartnerCouplingRecord> {
    const row = await this.prisma.taxYearLink.update({
      where: { id },
      data: { personBUserId, invitationCode: null, invitationCodeValidUntil: null },
    })
    return toRecord(row)
  }

  async delete(personAUserId: string, taxYear: number): Promise<boolean> {
    const existing = await this.prisma.taxYearLink.findUnique({
      where: {
        personAUserId_taxYear: { personAUserId, taxYear },
      },
    })
    if (!existing) return false

    await this.prisma.$transaction([
      this.prisma.taxYearLink.delete({
        where: { id: existing.id },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return true
  }
}
