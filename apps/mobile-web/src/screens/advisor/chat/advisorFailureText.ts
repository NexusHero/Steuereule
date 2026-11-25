import { isApiError } from '@steuereule/api-client'
import { ACCOUNT_REQUIRED, apiFailureMessage, FRESH_AUTH_REQUIRED, SESSION_EXPIRED, type ApiFailureKind } from '../../../net/apiFailure'
import { apiErrorText } from './apiErrorText'

type Translate = (key: string, options?: Record<string, unknown>) => string
/** Any i18next `t` (its overloads do not fit a plain signature). */
type AnyTranslate = (...args: never[]) => unknown

/**
 * What the owl's UI says about a failed request (WEB-14, NR-06): a domain refusal (409/422) carries the API's
 * own German sentence (a 400 its message field's entry); everything else — a 5xx, a 429, a lapsed session, no connection — the shared wording.
 * Never "Failed to fetch", "Internal server error" or an HTTP status.
 */
export function advisorFailureText(error: unknown, translate: AnyTranslate, overrides: Partial<Record<ApiFailureKind, string>> = {}): string {
  const t = translate as unknown as Translate
  // A DomainError (it has a `code`) speaks German — e.g. the owl's daily limit (429 ADVISOR_DAILY_LIMIT_EXCEEDED).
  // The three shared codes keep the shared wording; a 5xx never shows server text.
  const sharedCodes: readonly (string | undefined)[] = [ACCOUNT_REQUIRED, FRESH_AUTH_REQUIRED, SESSION_EXPIRED]
  if (isApiError(error) && error.code !== undefined && !sharedCodes.includes(error.code) && error.status < 500) {
    const said = apiErrorText({ message: (error.body as { message?: unknown } | null)?.message })
    if (said !== null) return said
  }
  if (isApiError(error) && (error.status === 409 || error.status === 422)) {
    const said = apiErrorText(error.body)
    if (said !== null) return said
  }
  // A 400 speaks only through the chat message's own field entry (German); its `message` may be English.
  if (isApiError(error) && error.status === 400) {
    const said = apiErrorText({ fields: (error.body as { fields?: unknown } | null)?.fields })
    if (said !== null) return said
  }
  return apiFailureMessage(error, t, overrides)
}
