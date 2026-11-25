import { useTranslation } from 'react-i18next'
import { ApiError, NetworkError, isApiError, isNetworkError, type ApiFieldError } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'

/**
 * What went wrong with a request, in the terms a screen has to answer (WEB-10, WEB-14, WEB-44): every
 * screen and every save reads a failure through this one function, so a 429 never says "check your
 * connection" and no raw English server text or HTTP status reaches the German UI.
 */
export type ApiFailureKind =
  | 'session-expired'
  | 'account-required'
  | 'step-up'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'too-large'
  | 'rate-limited'
  | 'validation'
  | 'offline'
  | 'server'
  | 'unknown'

export interface ApiFailure {
  readonly kind: ApiFailureKind
  readonly status: number | undefined
  readonly code: string | undefined
  readonly retryAfterSeconds: number | undefined
  readonly fieldErrors: readonly ApiFieldError[]
}

/** The code the API answers when an action needs a re-entered password (ADR-0106 D2). */
export const FRESH_AUTH_REQUIRED = 'FRESH_AUTH_REQUIRED'
/** A guest called an account-only endpoint. */
export const ACCOUNT_REQUIRED = 'ACCOUNT_REQUIRED'
/** The signed-in session no longer verifies (WEB-24). */
export const SESSION_EXPIRED = 'SESSION_EXPIRED'

function kindOf(status: number, code: string | undefined): ApiFailureKind {
  if (code === SESSION_EXPIRED) return 'session-expired'
  if (code === ACCOUNT_REQUIRED) return 'account-required'
  if (code === FRESH_AUTH_REQUIRED) return 'step-up'
  if (status === 401) return 'account-required'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409 || status === 412) return 'conflict'
  if (status === 413) return 'too-large'
  if (status === 429) return 'rate-limited'
  if (status === 400 || status === 422) return 'validation'
  if (status >= 500) return 'server'
  return 'unknown'
}

export function classifyApiFailure(error: unknown): ApiFailure {
  if (isApiError(error)) {
    return {
      kind: kindOf(error.status, error.code),
      status: error.status,
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
      fieldErrors: error.fieldErrors,
    }
  }
  const offline = isNetworkError(error) || error instanceof TypeError
  return { kind: offline ? 'offline' : 'unknown', status: undefined, code: undefined, retryAfterSeconds: undefined, fieldErrors: [] }
}

/** A refusal answered outside the generated client: better-auth's `{ status, code }`. */
export interface AnsweredRefusal {
  readonly status?: number | undefined
  readonly code?: string | undefined
}

/**
 * A refusal from outside the generated client as the error this mapping reads, so a 429 or a 5xx from
 * better-auth means the same as from any endpoint: an answer becomes an ApiError, a refusal without a status
 * (the request got no answer) a NetworkError. Code-specific messages stay with the caller; this only decides
 * what the status means.
 */
export function refusalError(refusal: AnsweredRefusal | null | undefined): ApiError | NetworkError {
  return refusal?.status === undefined ? new NetworkError() : new ApiError(refusal.status, { code: refusal.code })
}

/** Whether a retry can help on its own (React Query retry policy): a dropped connection or a server hiccup. */
export function isTransientFailure(error: unknown): boolean {
  const { kind } = classifyApiFailure(error)
  return kind === 'offline' || kind === 'server'
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Any i18next `t`, whichever namespace it was typed for: its overloads do not fit one plain signature, so
 * `apiFailureMessage` takes it as it is and narrows it here, once, instead of every caller casting.
 */
export type AnyTranslate = (...args: never[]) => unknown

/** The German sentence for a failure. `overrides` lets a screen say something more specific for one kind. */
export function apiFailureMessage(
  error: unknown,
  translate: AnyTranslate,
  overrides: Partial<Record<ApiFailureKind, string>> = {},
): string {
  const t = translate as unknown as Translate
  const failure = classifyApiFailure(error)
  const override = overrides[failure.kind]
  if (override !== undefined) return override
  switch (failure.kind) {
    case 'session-expired':
      return t('apiFehler.sessionExpired')
    case 'account-required':
      return t('apiFehler.accountRequired')
    case 'step-up':
      return t('apiFehler.stepUp')
    case 'forbidden':
      return t('apiFehler.forbidden')
    case 'not-found':
      return t('apiFehler.notFound')
    case 'conflict':
      return t('apiFehler.conflict')
    case 'too-large':
      return t('apiFehler.tooLarge')
    case 'rate-limited': {
      const seconds = failure.retryAfterSeconds
      if (seconds === undefined || seconds <= 0) return t('apiFehler.rateLimited')
      if (seconds < 120) return t('apiFehler.rateLimitedSeconds', { seconds })
      return t('apiFehler.rateLimitedMinutes', { minutes: Math.ceil(seconds / 60) })
    }
    case 'validation':
      return t('apiFehler.validation')
    case 'offline':
      return t('apiFehler.offline')
    case 'server':
      return t('apiFehler.server')
    case 'unknown':
      return t('apiFehler.unknown')
  }
}

/** The field errors of a 400, keyed by field path, for showing next to each input. */
export function fieldErrorsOf(error: unknown): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const { field, message } of classifyApiFailure(error).fieldErrors) {
    if (out[field] === undefined) out[field] = message
  }
  return out
}

/** `(error) => German message`, bound to the app's language. */
export function useApiFailureMessage(): (error: unknown, overrides?: Partial<Record<ApiFailureKind, string>>) => string {
  const { t } = useTranslation(APP_NS)
  return (error, overrides) => apiFailureMessage(error, t, overrides)
}
