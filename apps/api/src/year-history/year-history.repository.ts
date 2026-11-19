import type { FiledElsewhereAnswer, StoredFiledElsewhere, TaxYearStatus } from '@steuereule/core'

/** A year the account has anything for, with its ADR-0039 state where a tax year row keeps one. */
export interface HistoryYearRecord {
  readonly year: number
  readonly status: TaxYearStatus | null
  /**
   * The year has facts of its own (ADR-0099 §1). A tax year row that only holds the answer to „Schon
   * abgegeben?“, or an untouched draft, is no data: such a year gets no amount.
   */
  readonly hasData: boolean
  readonly filedElsewhere: StoredFiledElsewhere | null
}

export const YEAR_HISTORY_REPOSITORY = Symbol('YEAR_HISTORY_REPOSITORY')

/** Which years the Verlauf shows; userId-scoped (ADR-0007), never across accounts. */
export interface YearHistoryRepository {
  yearsOf(userId: string): Promise<HistoryYearRecord[]>
  /**
   * Stores the answer to „Schon abgegeben?“ with the state it puts the year in: `extern-erledigt` for „ja“
   * (filed elsewhere, the Bescheid still to come), else `entwurf`. Creates the tax year row if needed.
   */
  setFiledElsewhere(userId: string, year: number, answer: FiledElsewhereAnswer, answeredOn: string, status: TaxYearStatus): Promise<void>
}
