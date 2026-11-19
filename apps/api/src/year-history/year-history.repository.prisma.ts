import { Inject, Injectable } from '@nestjs/common'
import { isFiledElsewhereAnswer, isTaxYearStatus, type FiledElsewhereAnswer, type TaxYearStatus } from '@steuereule/core'
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
    const [taxYears, assessments, lstbs, ch, filings, answers, capital, pensions, rentals, commutes] = await Promise.all([
      this.prisma.taxYear.findMany({ where, select: { taxYear: true, status: true, filedElsewhere: true, filedElsewhereOn: true } }),
      this.prisma.assessment.findMany({ where, select }),
      this.prisma.lstb.findMany({ where, select }),
      this.prisma.chSalaryCertificate.findMany({ where, select }),
      this.prisma.filingVersion.findMany({ where, select }),
      this.prisma.interviewAnswer.findMany({ where, select, distinct: ['taxYear'] }),
      this.prisma.capital.findMany({ where, select }),
      this.prisma.pension.findMany({ where, select }),
      this.prisma.rentalProperty.findMany({ where, select, distinct: ['taxYear'] }),
      this.prisma.commute.findMany({ where, select }),
    ])
    const withData = new Set([...assessments, ...lstbs, ...ch, ...filings, ...answers, ...capital, ...pensions, ...rentals, ...commutes].map((r) => r.taxYear))
    const years = new Map<number, HistoryYearRecord>()
    for (const year of withData) years.set(year, { year, status: null, hasData: true, filedElsewhere: null })
    for (const row of taxYears) {
      const status = statusOf(row.status)
      const answer = row.filedElsewhere !== null && isFiledElsewhereAnswer(row.filedElsewhere) ? row.filedElsewhere : null
      // A row the app made on its own (an untouched draft) or for the answer alone is no fact of the year.
      const ownRow = status !== null && status !== 'entwurf' && answer === null
      years.set(row.taxYear, {
        year: row.taxYear,
        status,
        hasData: withData.has(row.taxYear) || ownRow,
        filedElsewhere: answer === null ? null : { answer, answeredOn: row.filedElsewhereOn ?? '' },
      })
    }
    return [...years.values()].sort((a, b) => a.year - b.year)
  }

  async setFiledElsewhere(userId: string, year: number, answer: FiledElsewhereAnswer, answeredOn: string, status: TaxYearStatus): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.taxYear.upsert({
        where: { userId_taxYear: { userId, taxYear: year } },
        create: { userId, taxYear: year, baseEstimate: 0, openItems: 0, openConflicts: 0, status, filedElsewhere: answer, filedElsewhereOn: answeredOn },
        update: { status, filedElsewhere: answer, filedElsewhereOn: answeredOn },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'steuerjahr' } }),
    ])
  }
}
