/**
 * The Cockpit estimate. PrintoutModule owns this port; the estimate's side binds it
 * (TaxEstimatePortsModule), because the estimate reads the same records the printout does.
 */
export const PRINTOUT_ESTIMATE = Symbol('PRINTOUT_ESTIMATE')

/** What the printout check needs of the estimate: whether the return ends in a payment. */
export interface PrintoutEstimate {
  getState(userId: string, taxYear: number): Promise<{ readonly kind: string; readonly result?: { readonly from: number; readonly to: number } }>
}
