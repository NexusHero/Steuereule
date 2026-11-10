import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CatalogScreen } from './CatalogScreen'
import type { CatalogEntryParam } from '../../navigation/routes'

const TAX_YEAR = 2025

function renderCatalog(entry: CatalogEntryParam, opts: { onDone?: () => void } = {}) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CatalogScreen entry={entry} taxYear={TAX_YEAR} onDone={opts.onDone ?? (() => {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('CatalogScreen — Slice 5 boosters (haushalt & gesundheit)', () => {
  it('renders haushalt-gate with hint under question and walks amount steps including AMOUNT_LATER', async () => {
    const posted: unknown[] = []
    const onDone = vi.fn()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, ({ request }) => {
        const entry = new URL(request.url).searchParams.get('eintrag')
        expect(entry).toBe('haushalt')
        return HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'haushalt-gate' }, openItems: 1 }, { status: 200 })
      }),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
      }),
    )

    renderCatalog('haushalt', { onDone })

    expect(
      await screen.findByText(
        'Hattest du Kosten für Handwerker, Haushaltshilfe oder Dienstleistungen rund um die Wohnung, auch aus der Nebenkostenabrechnung?',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('katalog-hinweis-haushalt-gate').textContent).toBe(
      'Nur Arbeits-, Maschinen- und Fahrtkosten zählen, kein Material. Bezahlt per Überweisung, nicht bar.',
    )

    fireEvent.click(screen.getByTestId('katalog-option-haushalt-gate-Ja'))

    const serviceInput = await screen.findByTestId('katalog-input-haushalt-dienstleistung-betrag')
    fireEvent.change(serviceInput, { target: { value: '1200' } })
    fireEvent.click(screen.getByTestId('katalog-submit-haushalt-dienstleistung-betrag'))

    await screen.findByTestId('katalog-input-haushalt-handwerker-betrag')
    fireEvent.click(screen.getByTestId('katalog-later-haushalt-handwerker-betrag'))

    const minijobInput = await screen.findByTestId('katalog-input-haushalt-minijob-betrag')
    fireEvent.change(minijobInput, { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('katalog-submit-haushalt-minijob-betrag'))

    await waitFor(() =>
      expect(posted).toEqual([
        { questionId: 'haushalt-gate', value: 'Ja' },
        { questionId: 'haushalt-dienstleistung-betrag', value: '1200' },
        { questionId: 'haushalt-handwerker-betrag', value: 'spaeter' },
        { questionId: 'haushalt-minijob-betrag', value: '0' },
      ]),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('walks gesundheit entry and completes when gesundheit-betrag is submitted or Nein is chosen', async () => {
    const posted: unknown[] = []
    const onDone = vi.fn()
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, ({ request }) => {
        const entry = new URL(request.url).searchParams.get('eintrag')
        expect(entry).toBe('gesundheit')
        return HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'gesundheit-gate' }, openItems: 1 }, { status: 200 })
      }),
      http.post(`*/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })
      }),
    )

    renderCatalog('gesundheit', { onDone })

    expect(
      await screen.findByText('Hattest du selbst bezahlte Krankheitskosten (Zuzahlungen, Brille, Zahnersatz, Medikamente auf Rezept)?'),
    ).toBeTruthy()
    expect(screen.queryByTestId('katalog-hinweis-gesundheit-gate')).toBeNull()

    fireEvent.click(screen.getByTestId('katalog-option-gesundheit-gate-Ja'))

    const medicalInput = await screen.findByTestId('katalog-input-gesundheit-betrag')
    expect(screen.queryByTestId('katalog-later-gesundheit-betrag')).toBeNull()
    fireEvent.change(medicalInput, { target: { value: '2500' } })
    fireEvent.click(screen.getByTestId('katalog-submit-gesundheit-betrag'))

    await waitFor(() =>
      expect(posted).toEqual([
        { questionId: 'gesundheit-gate', value: 'Ja' },
        { questionId: 'gesundheit-betrag', value: '2500' },
      ]),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})
