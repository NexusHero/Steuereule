import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  configureApiClient,
  getApiClientBaseUrl,
  httpClient,
  isApiError,
  isNetworkError,
  parseRetryAfter,
  resetApiClientConfig,
} from './http-client'

function fakeFetch(response: { status: number; body?: unknown }) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('httpClient', () => {
  afterEach(() => {
    resetApiClientConfig()
    vi.unstubAllGlobals()
  })

  it('prefixes the configured base URL onto the request path', async () => {
    const fetchSpy = fakeFetch({ status: 200, body: { ok: true } })
    vi.stubGlobal('fetch', fetchSpy)
    configureApiClient({ baseUrl: 'https://api.example.test' })

    await httpClient('/v1/profile', { method: 'GET' })

    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.test/v1/profile', expect.objectContaining({ method: 'GET' }))
  })

  it('defaults to a same-origin (empty) base URL when never configured', async () => {
    const fetchSpy = fakeFetch({ status: 200, body: { ok: true } })
    vi.stubGlobal('fetch', fetchSpy)

    await httpClient('/v1/profile', { method: 'GET' })

    expect(fetchSpy).toHaveBeenCalledWith('/v1/profile', expect.anything())
  })

  it('always sends credentials so the httpOnly guest-session cookie (ADR-0007) round-trips', async () => {
    const fetchSpy = fakeFetch({ status: 200, body: { ok: true } })
    vi.stubGlobal('fetch', fetchSpy)

    await httpClient('/v1/profile', { method: 'GET' })

    expect(fetchSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ credentials: 'include' }))
  })

  it('resolves with { data, status, headers } on a 200, never throwing', async () => {
    vi.stubGlobal('fetch', fakeFetch({ status: 200, body: { firstName: 'Anna' } }))

    const result = await httpClient<{ data: { firstName: string }; status: number }>('/v1/profile')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ firstName: 'Anna' })
  })

  it('rejects every status >= 400 with a typed ApiError carrying status, code and field errors (WEB-28)', async () => {
    vi.stubGlobal('fetch', fakeFetch({ status: 400, body: { fields: [{ field: 'steuerId', message: 'invalid' }] } }))

    const error = await httpClient('/v1/profile', { method: 'PUT' }).catch((e: unknown) => e)

    expect(isApiError(error)).toBe(true)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).fieldErrors).toEqual([{ field: 'steuerId', message: 'invalid' }])
  })

  it.each([401, 403, 404, 409, 413, 429, 500, 503])('a %i rejects instead of resolving an error body as data', async (status) => {
    vi.stubGlobal('fetch', fakeFetch({ status, body: { statusCode: status, code: 'SOME_CODE', message: 'x' } }))

    const error = await httpClient('/v1/profile').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(status)
    expect((error as ApiError).code).toBe('SOME_CODE')
  })

  it('reads Retry-After in seconds and as an HTTP date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '42' } })),
    )
    const error = (await httpClient('/v1/belege/upload').catch((e: unknown) => e)) as ApiError
    expect(error.retryAfterSeconds).toBe(42)
    expect(parseRetryAfter(new Date(10_000 + 30_000).toUTCString(), 10_000)).toBe(30)
    expect(parseRetryAfter(null)).toBeUndefined()
  })

  it('hands every ApiError to the configured onApiError before throwing it (WEB-24)', async () => {
    const onApiError = vi.fn()
    configureApiClient({ onApiError })
    vi.stubGlobal('fetch', fakeFetch({ status: 401, body: { code: 'SESSION_EXPIRED' } }))

    const error = await httpClient('/v1/profile').catch((e: unknown) => e)

    expect(onApiError).toHaveBeenCalledWith(error)
  })

  it('keeps a non-JSON error body as text rather than failing to parse it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })))

    const error = (await httpClient('/v1/profile').catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(502)
    expect(error.body).toBe('<html>Bad Gateway</html>')
    expect(error.code).toBeUndefined()
  })

  it('treats a 204/205/304 as bodyless rather than failing to parse', async () => {
    vi.stubGlobal('fetch', fakeFetch({ status: 204 }))

    const result = await httpClient<{ data: unknown; status: number }>('/v1/profile')

    expect(result.status).toBe(204)
    expect(result.data).toBeNull()
  })

  it('a network failure rejects with a NetworkError, distinct from an answered request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const error = await httpClient('/v1/profile').catch((e: unknown) => e)

    expect(isNetworkError(error)).toBe(true)
    expect(isApiError(error)).toBe(false)
  })

  it('an aborted request rethrows the AbortError unchanged so React Query can cancel', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort }))

    await expect(httpClient('/v1/profile')).rejects.toBe(abort)
  })
})

describe('getApiClientBaseUrl', () => {
  afterEach(() => {
    resetApiClientConfig()
  })

  it('defaults to the empty (same-origin) base URL', () => {
    expect(getApiClientBaseUrl()).toBe('')
  })

  it('reflects whatever configureApiClient was last called with — the same origin httpClient itself uses', () => {
    configureApiClient({ baseUrl: 'https://api.example.test' })

    expect(getApiClientBaseUrl()).toBe('https://api.example.test')
  })
})
