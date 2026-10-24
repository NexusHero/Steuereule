// KatalogScreen (REQ-017) — the on-demand catalogue walked by the same engine as the
// Minimal-Gate: renders the first Lebenslage question from GET ?eintrag=lebenslagen, posts the
// answer, and advances to the amount follow-up (a numeric input, never free text).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { KatalogScreen } from './KatalogScreen'
import { server } from '../../test-msw-server'

const TAX_YEAR = 2026

function renderKatalog(entry: 'lebenslagen' | 'sonderausgaben') {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <KatalogScreen entry={entry} taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('KatalogScreen', () => {
  it('renders the first Lebenslage question from GET ?eintrag=lebenslagen', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, ({ request }) => {
        const url = new URL(request.url)
        return url.searchParams.get('eintrag') === 'lebenslagen'
          ? HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'dhf' }, openItems: 5 }, { status: 200 })
          : HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 }, { status: 200 })
      }),
    )
    renderKatalog('lebenslagen')

    expect(await screen.findByText('Hast du eine doppelte Haushaltsführung?')).toBeTruthy()
    expect(screen.getByText('Ja')).toBeTruthy()
    expect(screen.getByText('Nein')).toBeTruthy()
  })

  it('advances to the integer follow-up after answering "Ja" (a numeric input, never free text)', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'dhf' }, openItems: 5 }, { status: 200 }),
      ),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, () =>
        HttpResponse.json({ nextStep: { kind: 'question', id: 'dhf-miete' }, openItems: 4 }, { status: 200 }),
      ),
    )
    renderKatalog('lebenslagen')
    fireEvent.click(await screen.findByText('Ja'))

    expect(await screen.findByText('Monatliche Miete am Arbeitsort')).toBeTruthy()
    expect(screen.getByLabelText('Monatliche Miete am Arbeitsort (Ganzzahlige Euro)')).toBeTruthy()
  })

  it('renders the first Sonderausgabe question for eintrag=sonderausgaben', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 3 }, { status: 200 }),
      ),
    )
    renderKatalog('sonderausgaben')

    expect(await screen.findByText('Hast du gespendet?')).toBeTruthy()
  })
})
