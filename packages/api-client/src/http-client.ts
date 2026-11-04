export interface ApiClientConfig {
  readonly baseUrl: string
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
