import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test-msw-server'
import { usePlausibility } from './usePlausibility'

const TAX_YEAR = 2026

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function mockCompleteLstb(year = TAX_YEAR) {
  server.use(
    http.get(`*/v1/steuerjahre/${year}/lstb`, () =>
      HttpResponse.json(
        {
          bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
          lohnsteuer: { kind: 'erfasst', value: 8000 },
          sozialversicherung: { kind: 'erfasst', value: 9000 },
          state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
        },
        { status: 200 },
      ),
    ),
  )
}

describe('usePlausibility (§ 3.1)', () => {
  it('starts in loading status and resolves conflicts/notices when ready', async () => {
    const { result } = renderHook(() => usePlausibility(TAX_YEAR), { wrapper: createWrapper() })
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.conflicts).toEqual([
      { kind: 'lstb-offen', fields: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'] },
    ])
    expect(result.current.notices).toEqual([])
  })

  it('reports error status when a backing query fails and exposes retry()', async () => {
    let fail = true
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/lstb`, () =>
        fail
          ? HttpResponse.json({ message: 'err' }, { status: 500 })
          : HttpResponse.json({
              bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
              lohnsteuer: { kind: 'erfasst', value: 8000 },
              sozialversicherung: { kind: 'erfasst', value: 9000 },
              state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
            }),
      ),
    )

    const { result } = renderHook(() => usePlausibility(TAX_YEAR), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('error'))

    fail = false
    result.current.retry()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.conflicts).toEqual([])
  })

  it('collects betrag-spaeter and erfasst-nicht-gerechnet notices when LStB is complete', async () => {
    mockCompleteLstb()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({
          answers: {
            job: 'Angestellt',
            ausland: 'Nein',
            kinder: 'Nein',
            familienstand: 'Ledig',
            dhf: 'Ja',
            'dhf-miete': 'spaeter',
            abfindung: 'Ja',
            'abfindung-betrag': '5000',
          },
          nextStep: { kind: 'done' },
          openItems: 0,
        }),
      ),
    )

    const { result } = renderHook(() => usePlausibility(TAX_YEAR), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.conflicts).toEqual([])
    expect(result.current.notices).toEqual([
      { kind: 'erfasst-nicht-gerechnet', amount: 5000 },
      { kind: 'betrag-spaeter', steps: ['dhf-miete'] },
    ])
  })

  it('does not raise lstb-offen for rente or ch paths where German LStB does not apply', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({
          answers: { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' },
          nextStep: { kind: 'done' },
          openItems: 0,
        }),
      ),
    )

    const wrapper = createWrapper()
    const { result } = renderHook(() => usePlausibility(TAX_YEAR), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.conflicts).toEqual([])

    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({
          answers: { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Verheiratet' },
          nextStep: { kind: 'done' },
          openItems: 0,
        }),
      ),
    )
    const { result: chResult } = renderHook(() => usePlausibility(TAX_YEAR), { wrapper: createWrapper() })
    await waitFor(() => expect(chResult.current.status).toBe('ready'))
    expect(chResult.current.conflicts).toEqual([])
  })
})
