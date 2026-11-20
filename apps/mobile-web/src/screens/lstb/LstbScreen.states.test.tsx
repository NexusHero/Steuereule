// The LStB mask's frame: a failed load that can be retried, leaving through Zurück and Weiter, and the
// summary line under the three fields for an incomplete and a complete certificate.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { LstbResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { EMPTY_LSTB_RESPONSE, server } from '../../test-msw-server'
import { LstbScreen, type LstbScreenProps } from './LstbScreen'

const LSTB_URL = '*/v1/steuerjahre/2026/lstb'

function renderLstb(props: LstbScreenProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <LstbScreen taxYear={2026} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('LstbScreen frame', () => {
  it('says the certificate could not be loaded and loads it again on retry', async () => {
    let healthy = false
    server.use(http.get(LSTB_URL, () => (healthy ? HttpResponse.json(EMPTY_LSTB_RESPONSE) : HttpResponse.json(null, { status: 500 }))))
    renderLstb()
    expect(await screen.findByText('Deine Lohnsteuerbescheinigung konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('Bruttoarbeitslohn (Zeile 3)')).toBeTruthy()
  })

  it('leaves with Zurück, and with Weiter even when no handler is wired', async () => {
    const onBack = vi.fn()
    renderLstb({ onBack })
    fireEvent.click(await screen.findByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    expect(() => fireEvent.click(screen.getByTestId('lstb-weiter'))).not.toThrow()
  })

  it('counts what is still open and unreadable', async () => {
    server.use(
      http.get(LSTB_URL, () =>
        HttpResponse.json({
          ...EMPTY_LSTB_RESPONSE,
          bruttoarbeitslohn: { kind: 'erfasst', value: 40000 },
          lohnsteuer: { kind: 'unklar' },
          state: { kind: 'unvollstaendig', open: ['sozialversicherung'], unclear: ['lohnsteuer'] },
        } satisfies LstbResponseDto),
      ),
    )
    renderLstb()
    expect(await screen.findByText('Noch 1 offen, 1 unlesbar.')).toBeTruthy()
  })

  it('says everything is recorded once the certificate is complete', async () => {
    server.use(
      http.get(LSTB_URL, () =>
        HttpResponse.json({
          bruttoarbeitslohn: { kind: 'erfasst', value: 40000 },
          lohnsteuer: { kind: 'erfasst', value: 5000 },
          sozialversicherung: { kind: 'erfasst', value: 8000 },
          state: { kind: 'vollstaendig' },
        } as LstbResponseDto),
      ),
    )
    renderLstb()
    expect(await screen.findByText('Alles erfasst ✓')).toBeTruthy()
  })
})
