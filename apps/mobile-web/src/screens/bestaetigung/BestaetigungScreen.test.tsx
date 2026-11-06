import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ConfirmationResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ConfirmationScreen } from './BestaetigungScreen'

const WITH_VALUES: ConfirmationResponseDto = {
  annexes: [
    {
      annex: 'anlageN',
      unconfirmed: 1,
      values: [
        {
          key: 'lstb.bruttoarbeitslohn',
          screen: 'lstb',
          instance: null,
          field: 'bruttoarbeitslohn',
          value: '4750',
          provenance: { kind: 'nutzer' },
          confirmed: true,
          proposal: { value: '4800', provenance: { kind: 'assistent', name: 'Claude' } },
        },
        {
          key: 'lstb.lohnsteuer',
          screen: 'lstb',
          instance: null,
          field: 'lohnsteuer',
          value: '700',
          provenance: { kind: 'uebernahme', lastYear: 2024 },
          confirmed: false,
          proposal: null,
        },
      ],
    },
  ],
}

function renderScreen(locale: 'de' | 'en' = 'de') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onBack = vi.fn()
  const onOpenScreen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n(locale)}>
        <ThemeProvider mode="light">
          <ConfirmationScreen year={2025} onBack={onBack} onOpenScreen={onOpenScreen} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onBack, onMaskeOeffnen: onOpenScreen }
}

afterEach(() => server.resetHandlers())

describe('BestaetigungScreen (REQ-032, ADR-0052 §6/§7)', () => {
  it('shows every new value per Anlage with its Herkunft, and a proposal as "X statt Y"', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    renderScreen()

    expect(await screen.findByText('Anlage N')).toBeTruthy()
    expect(screen.getByText('1 Wert unbestätigt')).toBeTruthy()
    expect(screen.getByText('Einbehaltene Lohnsteuer (Zeile 4)')).toBeTruthy()
    expect(screen.getByText('700 €')).toBeTruthy()
    expect(screen.getByText('Übernahme aus 2024')).toBeTruthy()
    expect(screen.getByText('Assistent: Claude schlägt 4.800 € statt 4.750 € vor.')).toBeTruthy()
  })

  it('confirming the Anlage calls the endpoint and shows the honest empty state afterwards', async () => {
    let confirmed = false
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(confirmed ? { annexes: [] } : WITH_VALUES)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/anlagen/anlageN', () => {
        confirmed = true
        return HttpResponse.json({ annexes: [] })
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('bestaetige-anlageN'))

    expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
    expect(confirmed).toBe(true)
  })

  it('accepting or discarding a proposal sends the decision for exactly that field', async () => {
    const decisions: { key: string; body: unknown }[] = []
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/vorschlaege/:key', async ({ params, request }) => {
        decisions.push({ key: String(params.key), body: await request.json() })
        return HttpResponse.json(WITH_VALUES)
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('vorschlag-annehmen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(decisions).toEqual([{ key: 'lstb.bruttoarbeitslohn', body: { decision: 'annehmen' } }]))
    fireEvent.click(screen.getByTestId('vorschlag-verwerfen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(decisions[1]).toEqual({ key: 'lstb.bruttoarbeitslohn', body: { decision: 'verwerfen' } }))
  })

  it('"einzeln ändern" opens the mask the value belongs to', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    const { onMaskeOeffnen: onOpenScreen } = renderScreen()

    fireEvent.click(await screen.findByTestId('aendern-anlageN'))
    expect(onOpenScreen).toHaveBeenCalledWith('lstb')
  })

  it('speaks English too', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    renderScreen('en')

    expect(await screen.findByText('1 value unconfirmed')).toBeTruthy()
    expect(screen.getByText('Carried over from 2024')).toBeTruthy()
    expect(screen.getByText('Assistant: Claude suggests 4.800 € instead of 4.750 €.')).toBeTruthy()
  })
})
