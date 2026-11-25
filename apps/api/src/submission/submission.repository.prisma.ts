import { Inject, Injectable } from '@nestjs/common'
import type { TaxYearStatus } from '@steuereule/core'
import { encodeFilingPositions } from '../assessment/filing-version.repository.prisma.js'
import { withSystemDatabaseAccess } from '../common/database-identity.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { joinTransaction } from '../prisma/transaction.js'
import { statusOf } from '../year-history/year-history.repository.prisma.js'
import { holdFilingVersion, releaseFilingVersionHolds } from '../account/legal-hold.prisma.js'
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
      const replaced = await tx.filingVersion.findMany({ where: { userId, taxYear }, select: { id: true } })
      // One version per year: a corrected return replaces the earlier one, its number counts the filings.
      await tx.filingVersion.deleteMany({ where: { userId, taxYear } })
      // The legal hold (§ 169, § 170 AO) moves to the version in force (P7, account/legal-hold.ts).
      await this.asHoldWriter(tx, (client) => releaseFilingVersionHolds(client, replaced.map((row) => row.id)))
      const created = await tx.filingVersion.create({
        data: {
          userId,
          taxYear,
          number: (previous?.number ?? 0) + 1,
          filingType: version.filingType,
          submittedOn: version.submittedOn,
          positions: encodeFilingPositions(version.positions, version.estimateAtSubmission),
        },
        select: { id: true, userId: true, submittedOn: true },
      })
      await this.asHoldWriter(tx, (client) => holdFilingVersion(client, created, new Date()))
      await tx.taxYear.update({ where: { userId_taxYear: { userId, taxYear } }, data: { status: 'eingereicht' } })
      await tx.taxDataAccessLog.create({ data: { userId, ...AUDIT } })
      return { replacedPrevious: previous !== null }
    })
  }

  /**
   * Legal holds are written by system paths only (P11): a user's request can never remove its own hold. The
   * submission's hold of the version in force is such a path; it runs on this repository's own client, joined
   * to the user's transaction `tx`, so the hold commits or rolls back with the version and only its queries
   * carry the reason.
   */
  private asHoldWriter(tx: object, write: (client: EncryptedPrismaClient) => Promise<void>): Promise<void> {
    return joinTransaction(tx, () => withSystemDatabaseAccess('legal-hold', () => write(this.prisma)))
  }

  async withdraw(userId: string, taxYear: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const withdrawn = await tx.filingVersion.findMany({ where: { userId, taxYear }, select: { id: true } })
      await tx.filingVersion.deleteMany({ where: { userId, taxYear } })
      // Not submitted after all: nothing to keep as proof of a submission.
      await this.asHoldWriter(tx, (client) => releaseFilingVersionHolds(client, withdrawn.map((row) => row.id)))
      await tx.taxYear.update({ where: { userId_taxYear: { userId, taxYear } }, data: { status: 'entwurf' } })
      await tx.taxDataAccessLog.create({ data: { userId, ...AUDIT } })
    })
  }
}
