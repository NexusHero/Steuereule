import type { Range } from '@steuereule/core'

/** What the Günstigerprüfung reads of the household's estimate: the taxable income, the § 32b income, and whether it is joint. */
export type HouseholdEstimateState =
  | {
      readonly kind: 'spanne'
      readonly taxableIncome: Range
      readonly jointAssessment?: boolean
      readonly breakdown?: { readonly progressionIncomeEur?: number }
    }
  | { readonly kind: 'offen'; readonly missing: readonly string[] }
  | { readonly kind: 'nicht-moeglich'; readonly reason: string }

/**
 * The Cockpit estimate of the household. CapitalModule owns this port; the estimate's side binds it
 * (TaxEstimatePortsModule), because the estimate itself reads the capital records.
 */
export const HOUSEHOLD_ESTIMATE = Symbol('HOUSEHOLD_ESTIMATE')
export interface HouseholdEstimate {
  getState(userId: string, taxYear: number): Promise<HouseholdEstimateState>
}
