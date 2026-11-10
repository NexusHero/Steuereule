// KatalogScreen (REQ-017) — the on-demand catalogue walked by the same engine as the
// Minimal-Gate: renders the first Lebenslage question from GET ?eintrag=lebenslagen, posts the
// answer, and advances to the amount follow-up (a numeric input, never free text).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { getInterviewControllerGetInterviewQueryKey } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { CatalogScreen } from './CatalogScreen'
import { server } from '../../test-msw-server'

const TAX_YEAR = 2026

function renderCatalog(
  entry: 'lebenslagen' | 'einkuenfte' | 'sonderausgaben' | 'alleinerziehend',
  opts: { onDone?: () => void; onBack?: () => void; revisit?: boolean; queryClient?: QueryClient } = {},
) {
  const i18n = createAppI18n('de')
  const queryClient = opts.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CatalogScreen
            entry={entry}
            taxYear={TAX_YEAR}
            onDone={opts.onDone ?? (() => {})}
            {...(opts.onBack ? { onBack: opts.onBack } : {})}
            {...(opts.revisit !== undefined ? { revisit: opts.revisit } : {})}
          />
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
    renderCatalog('lebenslagen')

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
    renderCatalog('lebenslagen')
    fireEvent.click(await screen.findByText('Ja'))

    expect(await screen.findByText('Monatliche Miete am Arbeitsort')).toBeTruthy()
    expect(screen.getByLabelText('Monatliche Miete am Arbeitsort (Ganzzahlige Euro)')).toBeTruthy()
  })

  it('submits an amount with a visible "Weiter" button, not only with Enter', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { dhf: 'Ja' }, nextStep: { kind: 'question', id: 'dhf-miete' }, openItems: 4 }, { status: 200 }),
      ),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'question', id: 'umzug' }, openItems: 3 }, { status: 200 })
      }),
    )
    renderCatalog('lebenslagen')
    const rent = await screen.findByLabelText('Monatliche Miete am Arbeitsort (Ganzzahlige Euro)')

    fireEvent.change(rent, { target: { value: '650' } })
    fireEvent.click(screen.getByText('Weiter'))

    await waitFor(() => expect(bodies).toEqual([{ questionId: 'dhf-miete', value: '650' }]))
  })

  it('renders the first Sonderausgabe question for eintrag=sonderausgaben', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 3 }, { status: 200 }),
      ),
    )
    renderCatalog('sonderausgaben')

    expect(await screen.findByText('Hast du gespendet?')).toBeTruthy()
  })

  it('skips questions answered on an earlier visit, even when an older empty state is still cached', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(getInterviewControllerGetInterviewQueryKey(TAX_YEAR, { eintrag: 'lebenslagen' }), {
      data: { answers: {}, nextStep: { kind: 'question', id: 'dhf' }, openItems: 5 },
      status: 200,
      headers: new Headers(),
    })
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json(
          { answers: { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' }, nextStep: { kind: 'done' }, openItems: 0 },
          { status: 200 },
        ),
      ),
    )
    const onDone = vi.fn()

    renderCatalog('lebenslagen', { onDone, queryClient })

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(screen.queryByText('Hast du eine doppelte Haushaltsführung?')).toBeNull()
  })

  it('steps back within the catalogue question-by-question before calling onBack', async () => {
    const onBack = vi.fn()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'dhf' }, openItems: 5 }, { status: 200 }),
      ),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, () =>
        HttpResponse.json({ nextStep: { kind: 'question', id: 'dhf-miete' }, openItems: 4 }, { status: 200 }),
      ),
    )
    renderCatalog('lebenslagen', { onBack })

    fireEvent.click(await screen.findByText('Ja'))
    expect(await screen.findByText('Monatliche Miete am Arbeitsort')).toBeTruthy()

    // First Back click returns to the previous question in the catalogue, NOT exiting immediately.
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(await screen.findByText('Hast du eine doppelte Haushaltsführung?')).toBeTruthy()
    expect(onBack).not.toHaveBeenCalled()

    // Second Back click on the first question delegates to onBack.
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('reopens on the last question instead of immediately firing onDone when revisited via Back (revisit=true)', async () => {
    const onDone = vi.fn()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json(
          { answers: { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' }, nextStep: { kind: 'done' }, openItems: 0 },
          { status: 200 },
        ),
      ),
    )

    renderCatalog('lebenslagen', { onDone, revisit: true })

    expect(await screen.findByTestId('katalog-option-nebenjob-Minijob')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('offers "Betrag später eintragen" on LATER_ALLOWED_STEPS, posts "spaeter", and advances to next step', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { dhf: 'Ja' }, nextStep: { kind: 'question', id: 'dhf-miete' }, openItems: 4 }, { status: 200 }),
      ),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'question', id: 'umzug' }, openItems: 3 }, { status: 200 })
      }),
    )
    renderCatalog('lebenslagen')

    fireEvent.click(await screen.findByTestId('katalog-later-dhf-miete'))

    await waitFor(() => expect(bodies).toEqual([{ questionId: 'dhf-miete', value: 'spaeter' }]))
    expect(await screen.findByTestId('katalog-option-umzug-Ja')).toBeTruthy()
  })

  it('does not show "Betrag später eintragen" on forbidden integer steps like abfindung-betrag', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json(
          { answers: { dhf: 'Nein', umzug: 'Nein', abfindung: 'Ja' }, nextStep: { kind: 'question', id: 'abfindung-betrag' }, openItems: 2 },
          { status: 200 },
        ),
      ),
    )
    renderCatalog('lebenslagen')

    await screen.findByTestId('katalog-input-abfindung-betrag')
    expect(screen.queryByTestId('katalog-later-abfindung-betrag')).toBeNull()
  })

  it('revisit=true jumps to the AMOUNT_LATER step while preserving unrelated answers, and replacing with a number completes', async () => {
    const bodies: unknown[] = []
    const onDone = vi.fn()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json(
          {
            answers: { dhf: 'Ja', 'dhf-miete': 'spaeter', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' },
            nextStep: { kind: 'done' },
            openItems: 0,
          },
          { status: 200 },
        ),
      ),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
      }),
    )

    renderCatalog('lebenslagen', { onDone, revisit: true })

    const input = await screen.findByTestId('katalog-input-dhf-miete')
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.click(screen.getByTestId('katalog-submit-dhf-miete'))

    await waitFor(() => expect(bodies).toEqual([{ questionId: 'dhf-miete', value: '1500' }]))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})
