import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, httpClient, resetApiClientConfig } from './http-client'

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

  it('resolves (does not throw) on a 400 — callers switch on status, per the typed contract', async () => {
    vi.stubGlobal('fetch', fakeFetch({ status: 400, body: { fields: [{ field: 'steuerId', message: 'invalid' }] } }))

    const result = await httpClient<{ data: unknown; status: number }>('/v1/profile', { method: 'PUT' })

    expect(result.status).toBe(400)
    expect(result.data).toEqual({ fields: [{ field: 'steuerId', message: 'invalid' }] })
  })

  it('treats a 204/205/304 as bodyless rather than failing to parse', async () => {
    vi.stubGlobal('fetch', fakeFetch({ status: 204 }))

    const result = await httpClient<{ data: unknown; status: number }>('/v1/profile')

    expect(result.status).toBe(204)
    expect(result.data).toBeNull()
  })

  it('a genuine network failure rejects (the one case that is a real error, not a status to switch on)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    await expect(httpClient('/v1/profile')).rejects.toThrow('network down')
  })
})
