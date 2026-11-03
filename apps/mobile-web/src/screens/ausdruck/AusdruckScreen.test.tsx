import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { AusdruckScreen } from './AusdruckScreen'


function mock(status: string, fehlend: string[] = []) {
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status })),
    http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ fehlend })),
  )
}

function renderScreen(props: { zahlung?: 'erfolg' | 'abbruch'; oeffneCheckout?: (url: string) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onAngabenErgaenzen = vi.fn()
  const onRiesterErgaenzen = vi.fn()
  const onKinderErgaenzen = vi.fn()
  const onVermietungErgaenzen = vi.fn()
  const onKapitalErgaenzen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AusdruckScreen
            jahr={2025}
            onZurueck={() => {}}
            onAngabenErgaenzen={onAngabenErgaenzen}
            onRiesterErgaenzen={onRiesterErgaenzen}
            onKinderErgaenzen={onKinderErgaenzen}
            onVermietungErgaenzen={onVermietungErgaenzen}
            onKapitalErgaenzen={onKapitalErgaenzen}
            {...props}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onAngabenErgaenzen, onRiesterErgaenzen, onKinderErgaenzen, onVermietungErgaenzen, onKapitalErgaenzen }
}

afterEach(() => server.resetHandlers())

describe('AusdruckScreen (ADR-0050)', () => {
  it('payable: the checkout button hands the browser to the hosted Stripe page', async () => {
    mock('offen')
    server.use(
      http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () =>
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
    mock('offen', ['iban'])
    const { onAngabenErgaenzen } = renderScreen()
    fireEvent.click(await screen.findByText('Angaben ergänzen'))
    expect(onAngabenErgaenzen).toHaveBeenCalled()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
  })

  it('married without a chosen Veranlagungsart: points to the Stammdaten where it is chosen', async () => {
    mock('offen', ['ehegatte'])
    const { onAngabenErgaenzen } = renderScreen()
    expect(await screen.findByText(/Leg in den Stammdaten fest, ob ihr zusammen oder einzeln veranlagt werdet/)).toBeTruthy()
    fireEvent.click(screen.getByText('Angaben ergänzen'))
    expect(onAngabenErgaenzen).toHaveBeenCalled()
  })

  it('Riester without the Anlage-AV details: names them and leads to the Sonderausgaben questions', async () => {
    mock('offen', ['riester'])
    const { onRiesterErgaenzen, onAngabenErgaenzen } = renderScreen()
    expect(await screen.findByText(/Für deinen Riester-Vertrag fehlen noch Angaben/)).toBeTruthy()
    expect(screen.queryByText('Angaben ergänzen')).toBeNull()
    fireEvent.click(screen.getByText('Riester-Angaben ergänzen'))
    expect(onRiesterErgaenzen).toHaveBeenCalled()
    expect(onAngabenErgaenzen).not.toHaveBeenCalled()
  })

  it('missing child details lead to the Kinder screen; uncovered child cases are named', async () => {
    mock('offen', ['kinder', 'anlageKindVolljaehrig'])
    const { onKinderErgaenzen } = renderScreen()
    expect(await screen.findByText(/Für die Anlage Kind fehlen noch Angaben zu deinen Kindern/)).toBeTruthy()
    expect(screen.getByText(/Angaben zu einem volljährigen Kind \(Anlage Kind\) gibt es den Ausdruck noch nicht/)).toBeTruthy()
    fireEvent.click(screen.getByText('Kinder-Angaben ergänzen'))
    expect(onKinderErgaenzen).toHaveBeenCalled()
  })

  it('missing capital facts lead to the Kapital screen', async () => {
    mock('offen', ['kapital'])
    const { onKapitalErgaenzen } = renderScreen()
    expect(await screen.findByText(/Für die Anlage KAP fehlen noch Angaben/)).toBeTruthy()
    fireEvent.click(screen.getByText('Kapital-Angaben ergänzen'))
    expect(onKapitalErgaenzen).toHaveBeenCalled()
  })

  it('missing rental facts lead to the Vermietung screen', async () => {
    mock('offen', ['vermietung'])
    const { onVermietungErgaenzen } = renderScreen()
    expect(await screen.findByText(/Für die Anlage V fehlen noch Angaben zu deiner Vermietung/)).toBeTruthy()
    fireEvent.click(screen.getByText('Vermietungs-Angaben ergänzen'))
    expect(onVermietungErgaenzen).toHaveBeenCalled()
  })

  it('an Anlage that is not printable yet is named, and paying is not offered', async () => {
    mock('offen', ['anlageV'])
    renderScreen()
    expect(await screen.findByText(/Für deine Vermietung \(Anlage V\) gibt es den Ausdruck noch nicht/)).toBeTruthy()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByText('Angaben ergänzen')).toBeNull()
  })

  it('payment not configured on this environment: says so, offers nothing to click', async () => {
    mock('nicht-verfuegbar')
    renderScreen()
    expect(await screen.findByText('Die Bezahlung ist auf dieser Umgebung noch nicht eingerichtet.')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
  })
})
