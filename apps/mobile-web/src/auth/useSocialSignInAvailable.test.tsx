// #336 review, F11(b) — the fact `LoginScreen`'s two-surface outage predicate is built on,
// asserted where it lives rather than only through a screen.
//
// `capabilitiesUnreachable` must mean "nothing answered", not "did not answer usefully". If a
// server that replied 500 ever counted as `'unreachable'`, then QR-down + capabilities-500 would
// raise "Unsere Server antworten nicht" — F1's defect restored, from the other side. Nothing
// asserted that meaning until this file: the mutation
// `if (!data || data.status !== 200) return 'unreachable'` left the whole suite green.
import { describe, it, expect } from 'vitest'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useSocialSignInAvailable } from './useSocialSignInAvailable'
import { server } from '../../test/test-msw-server'
import { renderHookWithQuery } from '../../test/test-render'

const BASE_URL = 'http://localhost:3000'

// A fresh client per test (no cache bleed between cases), and — the part #336's F12 is about —
// a handle on it, so a test can wait for the query to actually SETTLE.
//
// `'unknown'` is the hook's pending value as well as one of its answers. `waitFor(() =>
// expect(result.current).toBe('unknown'))` therefore passes on the first render, before anything
// has been fetched, and stays green even if the settled answer is 'unreachable'. The two tests
// that assert 'unknown' were doing exactly that: asserting the loading state and calling it a
// classification.
function renderAvailability() {
  const { result, client } = renderHookWithQuery(() => useSocialSignInAvailable('google'))
  /** Resolves once nothing is in flight — so what follows reads a settled answer, not a pending one. */
  const settled = () => waitFor(() => expect(client.isFetching()).toBe(0))
  return { result, settled }
}

describe('useSocialSignInAvailable — "unreachable" means nothing answered', () => {
  it('classifies a 500 as unknown, not unreachable — the server answered', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.json({ m: 'boom' }, { status: 500 })))
    const { result, settled } = renderAvailability()
    await settled()
    expect(result.current).toBe('unknown')
    expect(result.current).not.toBe('unreachable')
  })

  it('classifies a 403 as unknown, not unreachable — also an answer', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.json({}, { status: 403 })))
    const { result, settled } = renderAvailability()
    await settled()
    expect(result.current).toBe('unknown')
  })

  it('classifies a genuine transport failure as unreachable — nothing answered', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.error()))
    const { result } = renderAvailability()
    await waitFor(() => expect(result.current).toBe('unreachable'))
  })

  it('still answers the ordinary questions it always did', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.json({ socialProviders: ['google'] }, { status: 200 })))
    const { result } = renderAvailability()
    await waitFor(() => expect(result.current).toBe('available'))
  })

  it('reports not-configured when the deployment answered and the provider is absent', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.json({ socialProviders: [] }, { status: 200 })))
    const { result } = renderAvailability()
    await waitFor(() => expect(result.current).toBe('not-configured'))
  })
})
