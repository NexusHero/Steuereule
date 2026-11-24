export const STEP_UP_GRANT_REPOSITORY = Symbol('STEP_UP_GRANT_REPOSITORY')

/**
 * Read seam for the step-up grant that /verify-password records per session (ADR-0106 D2). Used by the
 * fresh-auth gate on the DSGVO export (ADR-0107 L1) so the controller/service layer never touches the
 * database client directly (ADR-0102 ports-and-adapters).
 */
export interface StepUpGrantRepository {
  /** True when an unexpired step-up grant exists for the given session. */
  hasValidGrant(sessionId: string, now?: Date): Promise<boolean>
}
