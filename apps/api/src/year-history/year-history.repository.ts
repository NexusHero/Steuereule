import type { TaxYearStatus } from '@steuereule/core'

/** A year the account has anything for, with its ADR-0039 state where a tax year row keeps one. */
export interface HistoryYearRecord {
  readonly year: number
  readonly status: TaxYearStatus | null
}

export const YEAR_HISTORY_REPOSITORY = Symbol('YEAR_HISTORY_REPOSITORY')

/** Which years the Verlauf shows; userId-scoped (ADR-0007), never across accounts. */
export interface YearHistoryRepository {
  yearsOf(userId: string): Promise<HistoryYearRecord[]>
}
