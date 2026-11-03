import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { BestaetigungResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { BestaetigungScreen } from './BestaetigungScreen'

const MIT_WERTEN: BestaetigungResponseDto = {
  anlagen: [
    {
      anlage: 'anlageN',
      unbestaetigt: 1,
      werte: [
        {
          key: 'lstb.bruttoarbeitslohn',
          maske: 'lstb',
          instanz: null,
          feld: 'bruttoarbeitslohn',
          wert: '4750',
          herkunft: { art: 'nutzer' },
          bestaetigt: true,
          vorschlag: { wert: '4800', herkunft: { art: 'assistent', name: 'Claude' } },
        },
        {
          key: 'lstb.lohnsteuer',
          maske: 'lstb',
          instanz: null,
          feld: 'lohnsteuer',
          wert: '700',
          herkunft: { art: 'uebernahme', vorjahr: 2024 },
          bestaetigt: false,
          vorschlag: null,
        },
      ],
    },
  ],
}

function renderScreen(locale: 'de' | 'en' = 'de') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onZurueck = vi.fn()
  const onMaskeOeffnen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n(locale)}>
        <ThemeProvider mode="light">
          <BestaetigungScreen jahr={2025} onZurueck={onZurueck} onMaskeOeffnen={onMaskeOeffnen} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onZurueck, onMaskeOeffnen }
}

afterEach(() => server.resetHandlers())

describe('BestaetigungScreen (REQ-032, ADR-0052 §6/§7)', () => {
  it('shows every new value per Anlage with its Herkunft, and a proposal as "X statt Y"', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(MIT_WERTEN)))
    renderScreen()

    expect(await screen.findByText('Anlage N')).toBeTruthy()
    expect(screen.getByText('1 Wert unbestätigt')).toBeTruthy()
    expect(screen.getByText('Einbehaltene Lohnsteuer (Zeile 4)')).toBeTruthy()
    expect(screen.getByText('700 €')).toBeTruthy()
    expect(screen.getByText('Übernahme aus 2024')).toBeTruthy()
    expect(screen.getByText('Assistent: Claude schlägt 4.800 € statt 4.750 € vor.')).toBeTruthy()
  })

  it('confirming the Anlage calls the endpoint and shows the honest empty state afterwards', async () => {
    let bestaetigt = false
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(bestaetigt ? { anlagen: [] } : MIT_WERTEN)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/anlagen/anlageN', () => {
        bestaetigt = true
        return HttpResponse.json({ anlagen: [] })
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('bestaetige-anlageN'))

    expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
    expect(bestaetigt).toBe(true)
  })

  it('accepting or discarding a proposal sends the decision for exactly that field', async () => {
    const entscheidungen: { key: string; body: unknown }[] = []
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(MIT_WERTEN)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/vorschlaege/:key', async ({ params, request }) => {
        entscheidungen.push({ key: String(params.key), body: await request.json() })
        return HttpResponse.json(MIT_WERTEN)
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('vorschlag-annehmen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(entscheidungen).toEqual([{ key: 'lstb.bruttoarbeitslohn', body: { entscheidung: 'annehmen' } }]))
    fireEvent.click(screen.getByTestId('vorschlag-verwerfen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(entscheidungen[1]).toEqual({ key: 'lstb.bruttoarbeitslohn', body: { entscheidung: 'verwerfen' } }))
  })

  it('"einzeln ändern" opens the mask the value belongs to', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(MIT_WERTEN)))
    const { onMaskeOeffnen } = renderScreen()

    fireEvent.click(await screen.findByTestId('aendern-anlageN'))
    expect(onMaskeOeffnen).toHaveBeenCalledWith('lstb')
  })

  it('speaks English too', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(MIT_WERTEN)))
    renderScreen('en')

    expect(await screen.findByText('1 value unconfirmed')).toBeTruthy()
    expect(screen.getByText('Carried over from 2024')).toBeTruthy()
    expect(screen.getByText('Assistant: Claude suggests 4.800 € instead of 4.750 €.')).toBeTruthy()
  })
})
