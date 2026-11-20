// The catalogue's frame: a failed load that can be retried, a finished page that moves on without a
// handler wired, and switching the asked person back and forth in a joint return (ADR-0088).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { CatalogScreen } from './CatalogScreen'
import { server } from '../../test-msw-server'

const INTERVIEW_URL = '*/v1/steuerjahre/2026/interview'

function renderCatalog(entry: 'lebenslagen' | 'sonderausgaben') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CatalogScreen entry={entry} taxYear={2026} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('CatalogScreen frame', () => {
  it('says the questions could not be loaded and loads them again on retry', async () => {
    let healthy = false
    server.use(
      http.get(INTERVIEW_URL, () =>
        healthy ? HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 1 }) : HttpResponse.json(null, { status: 500 }),
      ),
    )
    renderCatalog('sonderausgaben')
    expect(await screen.findByText('Das hat nicht geklappt.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByTestId('katalog-option-spenden-Nein')).toBeTruthy()
  })

  it('lets the user ask for themselves again after asking for the partner', async () => {
    const asked: string[] = []
    server.use(
      http.get('*/v1/steuerjahre/2026/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: 'b', personBHasOwnAccount: false, personB: { firstName: 'Nora' } }),
      ),
      http.get(INTERVIEW_URL, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('person') ?? 'A')
        return HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 3 })
      }),
    )
    renderCatalog('sonderausgaben')
    fireEvent.click(await screen.findByTestId('katalog-fuer-b'))
    await waitFor(() => expect(asked).toContain('B'))

    fireEvent.click(screen.getByTestId('katalog-fuer-a'))

    await waitFor(() => expect(screen.queryByTestId('katalog-fuer-partner')).toBeNull())
  })

  it('does not break when every question is answered and no handler is wired', async () => {
    server.use(http.get(INTERVIEW_URL, () => HttpResponse.json({ answers: { spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }, nextStep: { kind: 'done' }, openItems: 0 })))
    renderCatalog('sonderausgaben')
    await waitFor(() => expect(screen.queryByLabelText(/geladen/)).toBeNull())
    expect(screen.queryByText('Das hat nicht geklappt.')).toBeNull()
  })
})
