import type { ApiError } from '@steuereule/api-client'
import { SESSION_EXPIRED } from './apiFailure'

/**
 * WEB-24: a signed-in user whose session expired mid-form used to keep working as a guest, unseen. The API
 * now answers 401 SESSION_EXPIRED; the api client hands that error here, and the root navigator listens,
 * remembers where the user was and opens the sign-in. One notice per burst of failing requests.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let notified = false

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportSessionExpired(): void {
  if (notified) return
  notified = true
  for (const listener of listeners) listener()
}

/** After a new sign-in: the next expiry is reported again. */
export function resetSessionExpiry(): void {
  notified = false
}

/** The `onApiError` the app configures the api client with. */
export function watchForSessionExpiry(error: ApiError): void {
  if (error.status === 401 && error.code === SESSION_EXPIRED) reportSessionExpired()
}
