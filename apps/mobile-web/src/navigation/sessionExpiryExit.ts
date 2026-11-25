import { onSessionExpired } from '../net/sessionExpiry'
import { rememberReturnTo } from '../screens/funnel/sessionMemory'

/** What the app does when the API reports an expired session (WEB-24). */
export interface SessionExpiryExit {
  /** The path the user was on (web), to come back to after the new sign-in; null where there is none. */
  readonly currentPath: () => string | null
  /** Drops what the signed-in user left in memory: cached answers, the confirmed notices of the submission gate. */
  readonly forgetSignedInState: () => void
  /** Replaces the whole navigation with the sign-in, which says that the session expired. */
  readonly openSignIn: () => void
}

/**
 * WEB-24: an expired session opens the sign-in and remembers the place to come back to. The cache goes with it,
 * as on a sign-out: whoever signs in next on this device (another person, or the same one as a guest) must not
 * see the previous account's answers from memory. Returns the unsubscribe.
 */
export function leaveOnSessionExpiry(exit: SessionExpiryExit): () => void {
  return onSessionExpired(() => {
    const path = exit.currentPath()
    if (path !== null) rememberReturnTo(path)
    exit.forgetSignedInState()
    exit.openSignIn()
  })
}
