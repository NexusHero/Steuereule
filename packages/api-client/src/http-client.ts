export interface ApiClientConfig {
  readonly baseUrl: string
  /**
   * Called with every ApiError before it is thrown, whichever screen or hook made the request — the one
   * place the app can react to a failure no single screen owns, e.g. an expired session (WEB-24).
   */
  readonly onApiError?: ((error: ApiError) => void) | undefined
}

const DEFAULT_CONFIG: ApiClientConfig = { baseUrl: '' }

let config: ApiClientConfig = DEFAULT_CONFIG

export function configureApiClient(next: Partial<ApiClientConfig>): void {
  config = { ...config, ...next }
}

export function resetApiClientConfig(): void {
  config = DEFAULT_CONFIG
}

export function getApiClientBaseUrl(): string {
  return config.baseUrl
}

/** One invalid field of a rejected payload, as the API's validation filter reports it. */
export interface ApiFieldError {
  readonly field: string
  readonly message: string
}

/**
 * The server answered with a status >= 400 (WEB-28). Carries what a screen needs to say the right thing:
 * the status, the machine code from the error body (`FRESH_AUTH_REQUIRED`, `ACCOUNT_REQUIRED`, …), the
 * `Retry-After` wait and the per-field validation errors. The body is kept for callers that read `details`.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Headers = new Headers(),
  ) {
    const code = codeOf(body)
    super(`HTTP ${status}${code ? ` ${code}` : ''}`)
  }

  /** The `code` field of the error body, when the API sent one. */
  get code(): string | undefined {
    return codeOf(this.body)
  }

  /** `details` of a DomainError body, e.g. the current value behind a conflict. */
  get details(): Readonly<Record<string, unknown>> | undefined {
    const details = isRecord(this.body) ? this.body['details'] : undefined
    return isRecord(details) ? details : undefined
  }

  /** Seconds to wait before trying again, from `Retry-After` (seconds or an HTTP date). */
  get retryAfterSeconds(): number | undefined {
    return parseRetryAfter(this.headers.get('retry-after'))
  }

  get fieldErrors(): readonly ApiFieldError[] {
    const fields = isRecord(this.body) ? this.body['fields'] : undefined
    if (!Array.isArray(fields)) return []
    return fields.filter(
      (entry): entry is ApiFieldError =>
        isRecord(entry) && typeof entry['field'] === 'string' && typeof entry['message'] === 'string',
    )
  }
}

/** The request never got an answer: offline, DNS, CORS, a dropped connection (WEB-28). */
export class NetworkError extends Error {
  override readonly name = 'NetworkError'

  constructor(cause?: unknown) {
    super('The request did not reach the server.', { cause })
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

/** The status of a failed request, or undefined for a network failure or a non-API error. */
export function apiErrorStatus(error: unknown): number | undefined {
  return isApiError(error) ? error.status : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function codeOf(body: unknown): string | undefined {
  const code = isRecord(body) ? body['code'] : undefined
  return typeof code === 'string' ? code : undefined
}

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (header === null) return undefined
  const trimmed = header.trim()
  if (trimmed === '') return undefined
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, Math.ceil((at - now) / 1000))
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function parseBody(text: string | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const NO_BODY_STATUSES = new Set([204, 205, 304])

/**
 * The orval mutator. A 2xx resolves with `{ data, status, headers }`; every status >= 400 rejects with an
 * ApiError and a failed transport with a NetworkError, so no screen can read an error body as "no data yet".
 * An aborted request rethrows the AbortError unchanged (React Query cancels with it).
 */
export const httpClient = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  let response: Response
  let bodyText: string | null
  try {
    response = await fetch(`${config.baseUrl}${url}`, {
      ...options,
      credentials: 'include',
    })
    bodyText = NO_BODY_STATUSES.has(response.status) ? null : await response.text()
  } catch (error) {
    if (isAbort(error)) throw error
    throw new NetworkError(error)
  }

  if (response.status >= 400) {
    const error = new ApiError(response.status, parseBody(bodyText), response.headers)
    config.onApiError?.(error)
    throw error
  }

  const data: unknown = bodyText ? JSON.parse(bodyText) : null
  return { data, status: response.status, headers: response.headers } as T
}

export default httpClient
