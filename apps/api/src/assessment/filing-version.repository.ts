import type { AssessmentPositionValues, Range } from '@steuereule/core'

/** The return as frozen at submission (ADR-0098 §8): what the Bescheid-Abgleich compares against. */
export interface FilingVersionRecord {
  userId: string
  taxYear: number
  number: number
  filingType: 'einzel' | 'zusammen'
  /** ISO yyyy-mm-dd. */
  submittedOn: string
  positions: AssessmentPositionValues
  /** The refund the app estimated at submission, shown as „Schätzung vor dem Bescheid“. */
  estimateAtSubmission: Range | null
}

export const FILING_VERSION_REPOSITORY = Symbol('FILING_VERSION_REPOSITORY')

/**
 * Read seam of the frozen versions; userId-scoped (ADR-0007). A version is never edited: the Abgabe
 * (submission.repository.ts) writes it, a corrected return replaces it whole, the undo removes it.
 */
export interface FilingVersionRepository {
  /** The latest version of the year, or null when nothing was filed in the app. */
  findLatest(userId: string, taxYear: number): Promise<FilingVersionRecord | null>
  /** The latest version of every year of the account. */
  listLatestForUser(userId: string): Promise<FilingVersionRecord[]>
}
