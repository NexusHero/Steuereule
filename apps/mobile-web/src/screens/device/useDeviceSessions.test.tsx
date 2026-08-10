// #336 review — the guard that `DeviceListSection.test.tsx` structurally cannot prove.
//
// A 200 carrying a non-JSON body renders the same honest copy whether the failure was
// *classified* as 'unknown' or merely *fell back* to it, so every screen-level assertion is
// blind to the difference: reverting `Array.isArray(data)` leaves all 15 of that file's tests
// green. The observable that separates them is the error the query rejects with, one level
// below the copy — a `RequestFailedError` carrying a decided reason, versus a bare `TypeError`
// from `data.map(...)` that nothing ever classified.
//
// This is the ADR-0028 line in an awkward place: the effect a *user* sees is identical, so the
// thing worth checking is the effect the rest of the system consumes.
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { createAppI18n } from '../../i18n/app-i18n'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { useDeviceSessions } from './useDeviceSessions'
import { RequestFailedError } from '../../net/failure-reason'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

function wrapper({ children }: { children: ReactNode }) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const authClient = createAppAuthClient(BASE_URL)
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AuthClientProvider client={authClient}>{children}</AuthClientProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

describe('useDeviceSessions — the failure is classified, not merely survived', () => {
  it('rejects a non-JSON 200 with a decided unknown, not a stray TypeError', async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/list-sessions`, () =>
        HttpResponse.text('<html>Login to the hotel wifi</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    )

    const { result } = renderHook(() => useDeviceSessions(), { wrapper })
    await waitFor(() => expect(result.current.sessionsQuery.isError).toBe(true))

    const error = result.current.sessionsQuery.error
    // Without the `Array.isArray` guard this is a raw TypeError from `data.map(...)` — the copy
    // is identical either way, which is exactly why this assertion lives here and not on screen.
    expect(error).toBeInstanceOf(RequestFailedError)
    expect((error as RequestFailedError).reason).toBe('unknown')
  })

  it('rejects a server answer with a decided refused, carrying the status through', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => HttpResponse.json({ code: 'SESSION_NOT_FRESH' }, { status: 403 })))

    const { result } = renderHook(() => useDeviceSessions(), { wrapper })
    await waitFor(() => expect(result.current.sessionsQuery.isError).toBe(true))

    expect(result.current.sessionsQuery.error).toBeInstanceOf(RequestFailedError)
    expect((result.current.sessionsQuery.error as RequestFailedError).reason).toBe('refused')
  })
})
