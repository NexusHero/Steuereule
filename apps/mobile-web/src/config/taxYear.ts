/** The running calendar year — still open, so it can only be prepared, not filed (K2). */
export const CURRENT_TAX_YEAR = 2026

/** The years the cockpit offers: the current one and the four before it. */
export const SELECTABLE_TAX_YEARS: readonly number[] = Array.from({ length: 5 }, (_, i) => CURRENT_TAX_YEAR - i)

/**
 * The year a new user starts in: the last completed one, the one that can be filed now.
 * The running year stays selectable, but only on an explicit choice (UX review 2026-11, K2).
 */
export const DEFAULT_TAX_YEAR = CURRENT_TAX_YEAR - 1

/** Whether `year` is the running year (prepare mode: collect receipts, no official forms yet). */
export function isRunningTaxYear(year: number): boolean {
  return year === CURRENT_TAX_YEAR
}
