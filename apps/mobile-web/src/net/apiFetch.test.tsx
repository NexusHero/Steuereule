import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './apiFetch'
import { onSessionExpired, resetSessionExpiry } from './sessionExpiry'

/** WEB-24: every request outside the generated client reports an expired session, once, and stays readable. */
describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSessionExpiry()
  })

  const answering = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })))

  it('reports 401 SESSION_EXPIRED to the app and hands the response back unread', async () => {
    answering(401, { code: 'SESSION_EXPIRED', message: 'x' })
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    const response = await apiFetch('https://api.example.test/v1/belege/upload', { method: 'POST' })
    expect(expired).toHaveBeenCalledTimes(1)
    expect(await response.json()).toEqual({ code: 'SESSION_EXPIRED', message: 'x' })
    stop()
  })

  it('says nothing for another 401 (a missing account), a refusal or a success', async () => {
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    for (const [status, body] of [[401, { code: 'ACCOUNT_REQUIRED' }], [403, { code: 'STEP_UP_REQUIRED' }], [429, {}], [200, { ok: true }]] as const) {
      answering(status, body)
      expect((await apiFetch('https://api.example.test/v1/x')).status).toBe(status)
    }
    expect(expired).not.toHaveBeenCalled()
    stop()
  })

  it('passes the request on as it was given', async () => {
    answering(200, {})
    const init = { method: 'POST', credentials: 'include' as const, headers: { Accept: 'text/event-stream' } }
    await apiFetch('https://api.example.test/v1/y', init)
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/v1/y', init)
  })
})
