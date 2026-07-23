// The one fetch call site for the whole generated client (ADR-0001) — every orval hook
// calls this mutator, never `fetch` directly. The API origin is injected config
// (12-Factor III), not a literal baked into generated code; the app's entry point is
// responsible for calling `configureApiClient` with the environment's value.
//
// Deliberately mirrors orval's own default fetch-client shape (`{ data, status, headers }`,
// never throwing on a non-2xx) rather than inventing a different contract — callers switch
// on `.status` the way the generated response types model it (e.g. PUT's 200 vs 400). Only a
// genuine network failure (the fetch call itself rejecting) is a thrown error.
export interface ApiClientConfig {
  /** Origin prepended to every request path. Empty = same-origin (relative) requests. */
  readonly baseUrl: string
}

const DEFAULT_CONFIG: ApiClientConfig = { baseUrl: '' }

let config: ApiClientConfig = DEFAULT_CONFIG

/** Overrides the API origin at runtime — called once at app startup, and by tests. */
export function configureApiClient(next: Partial<ApiClientConfig>): void {
  config = { ...config, ...next }
}

/** Restores the default (same-origin) configuration. Test-only escape hatch. */
export function resetApiClientConfig(): void {
  config = DEFAULT_CONFIG
}

const NO_BODY_STATUSES = new Set([204, 205, 304])

export const httpClient = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${config.baseUrl}${url}`, {
    ...options,
    credentials: 'include',
  })

  const bodyText = NO_BODY_STATUSES.has(response.status) ? null : await response.text()
  const data: unknown = bodyText ? JSON.parse(bodyText) : null

  return { data, status: response.status, headers: response.headers } as T
}

export default httpClient
