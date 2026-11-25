import { ApiError } from '@steuereule/api-client'
import { watchForSessionExpiry } from './sessionExpiry'

/**
 * The one way to call the API outside the generated client: downloads, the multipart upload, the event stream,
 * the OAuth consent. It is `fetch` plus the app-wide reaction to an expired session (WEB-24): the API answers
 * 401 SESSION_EXPIRED once and clears the cookie, so a caller that did not report it would let the next request
 * continue as a new guest, unseen. The response is handed back untouched (the body is read from a copy).
 *
 * `api-error-handling.architecture.test.tsx` forbids a bare `fetch(` anywhere else in `src`.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.status === 401) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null)
    watchForSessionExpiry(new ApiError(response.status, body, response.headers))
  }
  return response
}
