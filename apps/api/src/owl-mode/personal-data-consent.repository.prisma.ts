import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PersonalDataConsentRecord, PersonalDataConsentRepository } from './personal-data-consent.repository.js'

const toRecord = (row: { userId: string; version: string; grantedAt: Date; revokedAt: Date | null }): PersonalDataConsentRecord => ({
  userId: row.userId,
  version: row.version,
  grantedAt: row.grantedAt,
  revokedAt: row.revokedAt,
})

@Injectable()
export class PrismaPersonalDataConsentRepository implements PersonalDataConsentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<PersonalDataConsentRecord | null> {
    const row = await this.prisma.owlPersonalDataConsent.findUnique({ where: { userId } })
    return row ? toRecord(row) : null
  }

  async grant(userId: string, version: string, at: Date): Promise<PersonalDataConsentRecord> {
    const row = await this.prisma.owlPersonalDataConsent.upsert({
      where: { userId },
      create: { userId, version, grantedAt: at, revokedAt: null },
      update: { version, grantedAt: at, revokedAt: null },
    })
    return toRecord(row)
  }

  async revoke(userId: string, at: Date): Promise<PersonalDataConsentRecord | null> {
    const existing = await this.prisma.owlPersonalDataConsent.findUnique({ where: { userId } })
    if (!existing) return null
    return toRecord(await this.prisma.owlPersonalDataConsent.update({ where: { userId }, data: { revokedAt: at } }))
  }
}
