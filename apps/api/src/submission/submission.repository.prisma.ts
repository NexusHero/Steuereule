import { Inject, Injectable } from '@nestjs/common'
import type { TaxYearStatus } from '@steuereule/core'
import { encodeFilingPositions } from '../assessment/filing-version.repository.prisma.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { statusOf } from '../year-history/year-history.repository.prisma.js'
import type { NewFilingVersion, SubmissionRepository } from './submission.repository.js'

const AUDIT = { action: 'WRITE', resource: 'abgabe' } as const

@Injectable()
export class PrismaSubmissionRepository implements SubmissionRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async yearStatus(userId: string, taxYear: number): Promise<TaxYearStatus | null> {
    const row = await this.prisma.taxYear.findUnique({ where: { userId_taxYear: { userId, taxYear } }, select: { status: true } })
    return row === null ? null : statusOf(row.status)
  }

  async record(version: NewFilingVersion): Promise<{ replacedPrevious: boolean }> {
    const { userId, taxYear } = version
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.filingVersion.findFirst({ where: { userId, taxYear }, orderBy: { number: 'desc' }, select: { number: true } })
      // One version per year: a corrected return replaces the earlier one, its number counts the filings.
      await tx.filingVersion.deleteMany({ where: { userId, taxYear } })
      await tx.filingVersion.create({
        data: {
          userId,
          taxYear,
          number: (previous?.number ?? 0) + 1,
          filingType: version.filingType,
          submittedOn: version.submittedOn,
          positions: encodeFilingPositions(version.positions, version.estimateAtSubmission),
        },
      })
      await tx.taxYear.update({ where: { userId_taxYear: { userId, taxYear } }, data: { status: 'eingereicht' } })
      await tx.taxDataAccessLog.create({ data: { userId, ...AUDIT } })
      return { replacedPrevious: previous !== null }
    })
  }

  async withdraw(userId: string, taxYear: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.filingVersion.deleteMany({ where: { userId, taxYear } }),
      this.prisma.taxYear.update({ where: { userId_taxYear: { userId, taxYear } }, data: { status: 'entwurf' } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, ...AUDIT } }),
    ])
  }
}
