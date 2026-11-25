import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { PartnerCouplingRecord, PartnerCouplingRepository } from './link.repository.js'
import { moveShadowDataToAccount } from '../account/person-data-move.prisma.js'
import { isShadowId } from '../account/personal-data-registry.js'

function toRecord(row: {
  id: string
  personAUserId: string
  personBUserId: string
  taxYear: number
  filingType: string
  invitationCode: string | null
  invitationCodeValidUntil: Date | null
  personBConsentedAt?: Date | null
}): PartnerCouplingRecord {
  return {
    id: row.id,
    personAUserId: row.personAUserId,
    personBUserId: row.personBUserId,
    taxYear: row.taxYear,
    filingType: row.filingType as 'einzel' | 'zusammen',
    invitationCode: row.invitationCode,
    invitationCodeValidUntil: row.invitationCodeValidUntil,
    personBConsentedAt: row.personBConsentedAt ?? null,
  }
}

/**
 * The transaction-aware client (MCP-22): a write to the Kopplung joins the surrounding `TransactionRunner.run`,
 * so a simulated Veranlagungsart (`auswirkung_simulieren`) is rolled back with everything else. The row holds no
 * encrypted field, so the encryption extension changes nothing for it.
 */
@Injectable()
export class PrismaLinkRepository implements PartnerCouplingRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserAndYear(userId: string, taxYear: number): Promise<PartnerCouplingRecord | null> {
    const row = await this.prisma.taxYearLink.findFirst({
      where: {
        taxYear,
        OR: [{ personAUserId: userId }, { personBUserId: userId }],
      },
    })
    return row ? toRecord(row) : null
  }

  async listForPersonA(personAUserId: string): Promise<PartnerCouplingRecord[]> {
    const rows = await this.prisma.taxYearLink.findMany({ where: { personAUserId }, orderBy: { taxYear: 'asc' } })
    return rows.map(toRecord)
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
      personBConsentedAt?: Date | null
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
          personBConsentedAt: data.personBConsentedAt ?? null,
        },
        update: {
          personBUserId: data.personBUserId,
          filingType: data.filingType,
          ...(data.invitationCode !== undefined && { invitationCode: data.invitationCode }),
          ...(data.invitationCodeValidUntil !== undefined && { invitationCodeValidUntil: data.invitationCodeValidUntil }),
          ...(data.personBConsentedAt !== undefined && { personBConsentedAt: data.personBConsentedAt }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: personAUserId, action: 'WRITE', resource: 'kopplung' },
      }),
    ])
    return toRecord(row)
  }

  async claimInvitation(code: string, taxYear: number, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.taxYearLink.findUnique({ where: { invitationCode: code }, select: { id: true, personBUserId: true, taxYear: true } })
      if (!before || before.taxYear !== taxYear) return null
      // Compare-and-set on the code (API-8): the first redeemer clears it, a concurrent second one matches nothing.
      const claimed = await tx.taxYearLink.updateMany({
        where: { id: before.id, invitationCode: code, invitationCodeValidUntil: { gt: now } },
        data: { personBUserId, invitationCode: null, invitationCodeValidUntil: null, personBConsentedAt: now },
      })
      if (claimed.count !== 1) return null
      // What A recorded for B under the shadow id is B's from now on (API-2): no orphaned shadow rows.
      if (isShadowId(before.personBUserId) && before.personBUserId !== personBUserId) {
        await moveShadowDataToAccount(tx, before.personBUserId, personBUserId, before.taxYear)
      }
      await tx.taxDataAccessLog.create({ data: { userId: personBUserId, action: 'WRITE', resource: 'kopplung' } })
      return toRecord(await tx.taxYearLink.findUniqueOrThrow({ where: { id: before.id } }))
    })
  }

  async recordPersonBConsent(id: string, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null> {
    const updated = await this.prisma.taxYearLink.updateMany({ where: { id, personBUserId }, data: { personBConsentedAt: now } })
    if (updated.count !== 1) return null
    await this.prisma.taxDataAccessLog.create({ data: { userId: personBUserId, action: 'WRITE', resource: 'kopplung' } })
    return toRecord(await this.prisma.taxYearLink.findUniqueOrThrow({ where: { id } }))
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
