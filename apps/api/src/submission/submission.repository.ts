import type { TaxYearStatus } from '@steuereule/core'
import type { FilingVersionRecord } from '../assessment/filing-version.repository.js'

/** A version about to be frozen; the repository numbers it. */
export type NewFilingVersion = Omit<FilingVersionRecord, 'number'>

export const SUBMISSION_REPOSITORY = Symbol('SUBMISSION_REPOSITORY')

/**
 * Write seam of the Abgabe (ADR-0098 §8), userId-scoped (ADR-0007). The frozen version, the year's
 * state and the audit row change together or not at all, so a year is never `eingereicht` without
 * the version its Bescheid-Abgleich needs.
 */
export interface SubmissionRepository {
  /** The state of the year's TaxYear row; null when the year has no row (nothing entered yet). */
  yearStatus(userId: string, taxYear: number): Promise<TaxYearStatus | null>
  /**
   * Freezes `version` as the year's one version and marks the year `eingereicht`. A corrected return
   * replaces the earlier version (its number counts on); `replacedPrevious` says whether there was one.
   */
  record(version: NewFilingVersion): Promise<{ replacedPrevious: boolean }>
  /** Removes the year's versions and puts the year back to `entwurf`. */
  withdraw(userId: string, taxYear: number): Promise<void>
}
