import { SESSION_ABSOLUTE_MAX_AGE_MS } from '../auth/session-lifetime.js'
import { STEP_UP_WINDOW_MS } from '../auth/step-up-policy.js'

/**
 * The `createdAt` and latest expiry of a session minted by the device flow (API-1).
 *
 * The session is a copy of the approving one, not a new sign-in: it starts no earlier clock than the approver's
 * (so the absolute cap of ADR-0103 is not extended), and it is never younger than the step-up window (so it does
 * not count as fresh for the step-up rule). Without a recorded anchor (a code approved before this shipped) the
 * session is only made not-fresh.
 */
export function deviceSessionAnchor(approverCreatedAt: Date | null, now: Date = new Date()): { createdAt: Date; latestExpiry: Date } {
  const notFresh = now.getTime() - STEP_UP_WINDOW_MS - 1_000
  const start = Math.min(approverCreatedAt?.getTime() ?? notFresh, notFresh)
  return { createdAt: new Date(start), latestExpiry: new Date(start + SESSION_ABSOLUTE_MAX_AGE_MS) }
}
