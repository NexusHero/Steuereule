import { Inject, Injectable } from '@nestjs/common'
import { isTaxYearStatus, type TaxYearStatus } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { HistoryYearRecord, YearHistoryRepository } from './year-history.repository.js'

/** A stored state the core does not know is read as no state at all, not guessed. */
export function statusOf(value: string): TaxYearStatus | null {
  return isTaxYearStatus(value) ? value : null
}

@Injectable()
export class PrismaYearHistoryRepository implements YearHistoryRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async yearsOf(userId: string): Promise<HistoryYearRecord[]> {
    // Only the year columns are selected: nothing encrypted is read to list the years.
    const where = { userId }
    const select = { taxYear: true } as const
    const [taxYears, assessments, lstbs, ch, filings, answers] = await Promise.all([
      this.prisma.taxYear.findMany({ where, select: { taxYear: true, status: true } }),
      this.prisma.assessment.findMany({ where, select }),
      this.prisma.lstb.findMany({ where, select }),
      this.prisma.chSalaryCertificate.findMany({ where, select }),
      this.prisma.filingVersion.findMany({ where, select }),
      this.prisma.interviewAnswer.findMany({ where, select, distinct: ['taxYear'] }),
    ])
    const years = new Map<number, TaxYearStatus | null>()
    for (const row of [...assessments, ...lstbs, ...ch, ...filings, ...answers]) years.set(row.taxYear, null)
    for (const row of taxYears) years.set(row.taxYear, statusOf(row.status))
    return [...years.entries()].sort(([a], [b]) => a - b).map(([year, status]) => ({ year, status }))
  }
}
