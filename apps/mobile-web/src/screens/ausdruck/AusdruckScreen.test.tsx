import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { StammdatenResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { AusdruckScreen } from './AusdruckScreen'

const VOLLSTAENDIG: StammdatenResponseDto = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  hausnummerZusatz: null,
  plz: '01067',
  wohnort: 'Dresden',
  beruf: null,
  religion: 'VD',
  familienstand: 'ledig',
  familienstandSeit: null,
  iban: 'DE89370400440532013000',
  kontoinhaber: null,
  finanzamt: 'Dresden-Nord',
  telefon: null,
  fehlend: [],
}

function mock(status: string, stammdaten = VOLLSTAENDIG) {
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status })),
    http.get('*/v1/stammdaten', () => HttpResponse.json(stammdaten)),
  )
}

function renderScreen(props: { zahlung?: 'erfolg' | 'abbruch'; oeffneCheckout?: (url: string) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onAngabenErgaenzen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AusdruckScreen jahr={2025} onZurueck={() => {}} onAngabenErgaenzen={onAngabenErgaenzen} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onAngabenErgaenzen }
}

afterEach(() => server.resetHandlers())

describe('AusdruckScreen (ADR-0050)', () => {
  it('payable: the checkout button hands the browser to the hosted Stripe page', async () => {
    mock('offen')
    server.use(
      http.post('*/v1/steuerjahre/2025/freischaltung/checkout', () =>
        HttpResponse.json({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
      ),
    )
    const oeffneCheckout = vi.fn()
    renderScreen({ oeffneCheckout })

    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    await waitFor(() => expect(oeffneCheckout).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'))
  })

  it('back from Stripe with "erfolg" but not yet confirmed: a waiting state, never a download', async () => {
    mock('offen')
    renderScreen({ zahlung: 'erfolg' })
    expect(await screen.findByText('Deine Zahlung wird bestätigt. Das dauert meist nur Sekunden.')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-herunterladen')).toBeNull()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
  })

  it('unlocked: offers the download and the hand-in rules', async () => {
    mock('freigeschaltet')
    renderScreen()
    expect(await screen.findByTestId('ausdruck-herunterladen')).toBeTruthy()
    expect(screen.getByText('• Den Hauptvordruck auf Seite 2 unterschreiben.')).toBeTruthy()
  })

  it('missing details: names it, links to the form, and does not let you pay first', async () => {
    mock('offen', { ...VOLLSTAENDIG, iban: null, fehlend: ['iban'] })
    const { onAngabenErgaenzen } = renderScreen()
    fireEvent.click(await screen.findByText('Angaben ergänzen'))
    expect(onAngabenErgaenzen).toHaveBeenCalled()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
  })

  it('married: says plainly the printout is not available yet, instead of choosing a Veranlagungsart', async () => {
    mock('offen', { ...VOLLSTAENDIG, familienstand: 'verheiratet' })
    renderScreen()
    expect(await screen.findByText(/Für Verheiratete ist der Ausdruck noch nicht möglich/)).toBeTruthy()
  })

  it('payment not configured on this environment: says so, offers nothing to click', async () => {
    mock('nicht-verfuegbar')
    renderScreen()
    expect(await screen.findByText('Die Bezahlung ist auf dieser Umgebung noch nicht eingerichtet.')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
  })
})
