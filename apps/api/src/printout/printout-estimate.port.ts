import type { BusinessEstimate, EstimateBreakdown, EstimateChurchTax } from '@steuereule/core'

/**
 * The Cockpit estimate. PrintoutModule owns this port; the estimate's side binds it
 * (TaxEstimatePortsModule), because the estimate reads the same records the printout does.
 */
export const PRINTOUT_ESTIMATE = Symbol('PRINTOUT_ESTIMATE')

interface Range {
  readonly from: number
  readonly to: number
}

/**
 * What the printout reads of the estimate. `kind` and `result` decide whether the return ends in a
 * payment; the rest are the steps behind the result, which the summary pages lay out (present for a
 * `spanne`).
 */
export interface PrintoutEstimateState {
  readonly kind: string
  /** Positive = Erstattung, negative = Nachzahlung. */
  readonly result?: Range
  readonly werbungskosten?: number
  readonly provision?: Range
  readonly specialExpenses?: number
  readonly taxableIncome?: Range
  readonly incomeTax?: Range
  readonly solidaritaetszuschlag?: Range
  readonly anrechnung?: number
  readonly churchTax?: EstimateChurchTax
  readonly churchTaxOpen?: boolean
  readonly business?: BusinessEstimate
  readonly breakdown?: EstimateBreakdown
  readonly laterAmounts?: number
  readonly prepayments?: number
  readonly jointAssessment?: boolean
}

/** What the printout needs of the estimate: whether the return ends in a payment, and how the result comes about. */
export interface PrintoutEstimate {
  getState(userId: string, taxYear: number): Promise<PrintoutEstimateState>
}
