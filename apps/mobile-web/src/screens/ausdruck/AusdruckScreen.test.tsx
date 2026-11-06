import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { PrintoutScreen } from './AusdruckScreen'


function mock(status: string, missing: string[] = []) {
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status })),
    http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing })),
  )
}

function renderScreen(props: { payment?: 'erfolg' | 'abbruch'; openCheckout?: (url: string) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onCompleteDetails = vi.fn()
  const onCompleteRiester = vi.fn()
  const onCompleteChildren = vi.fn()
  const onCompleteRental = vi.fn()
  const onCompleteCapital = vi.fn()
  const onCompleteCrossBorder = vi.fn()
  const onConfirm = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <PrintoutScreen
            year={2025}
            onBack={() => {}}
            onCompleteDetails={onCompleteDetails}
            onCompleteRiester={onCompleteRiester}
            onCompleteChildren={onCompleteChildren}
            onCompleteRental={onCompleteRental}
            onCompleteCapital={onCompleteCapital}
            onCompleteCrossBorder={onCompleteCrossBorder}
            onConfirm={onConfirm}
            {...props}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onCompleteDetails, onCompleteRiester, onCompleteChildren, onCompleteRental, onCompleteCapital, onCompleteCrossBorder, onConfirm }
}

afterEach(() => server.resetHandlers())

describe('AusdruckScreen (ADR-0050)', () => {
  it('says honestly that a year has no Vordrucke yet, instead of a generic load error', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: 'offen' })),
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () =>
        HttpResponse.json({ statusCode: 404, error: 'Not Found', code: 'VORDRUCKE_MISSING', message: 'x' }, { status: 404 }),
      ),
    )
    renderScreen()

    expect(await screen.findByText('Für 2025 gibt es die amtlichen Vordrucke noch nicht.')).toBeTruthy()
    expect(screen.queryByText('Der Stand konnte nicht geladen werden.')).toBeNull()
  })

  it('payable: the checkout button hands the browser to the hosted Stripe page', async () => {
    mock('offen')
    server.use(
      http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () =>
        HttpResponse.json({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
      ),
    )
    const openCheckout = vi.fn()
    renderScreen({ openCheckout })

    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'))
  })

  it('back from Stripe with "erfolg" but not yet confirmed: a waiting state, never a download', async () => {
    mock('offen')
    renderScreen({ payment: 'erfolg' })
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

  it('unlocked: also offers an editable PDF, named as such, requested with ?bearbeitbar=true', async () => {
    mock('freigeschaltet')
    let requested = ''
    server.use(
      http.get('*/v1/steuerjahre/2025/ausdruck', ({ request }) => {
        requested = request.url
        return new HttpResponse(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-herunterladen-bearbeitbar'))
    expect(screen.getByText(/Zum Korrigieren vor dem Druck/)).toBeTruthy()
    await waitFor(() => expect(requested).toContain('/ausdruck?bearbeitbar=true'))
  })

  it('missing details: names it, links to the form, and does not let you pay first', async () => {
    mock('offen', ['iban'])
    const { onCompleteDetails } = renderScreen()
    fireEvent.click(await screen.findByText('Angaben ergänzen'))
    expect(onCompleteDetails).toHaveBeenCalled()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
  })

  it('married without a chosen Veranlagungsart: points to the Stammdaten where it is chosen', async () => {
    mock('offen', ['ehegatte'])
    const { onCompleteDetails } = renderScreen()
    expect(await screen.findByText(/Leg in den Stammdaten fest, ob ihr zusammen oder einzeln veranlagt werdet/)).toBeTruthy()
    fireEvent.click(screen.getByText('Angaben ergänzen'))
    expect(onCompleteDetails).toHaveBeenCalled()
  })

  it('Riester without the Anlage-AV details: names them and leads to the Sonderausgaben questions', async () => {
    mock('offen', ['riester'])
    const { onCompleteRiester, onCompleteDetails } = renderScreen()
    expect(await screen.findByText(/Für deinen Riester-Vertrag fehlen noch Angaben/)).toBeTruthy()
    expect(screen.queryByText('Angaben ergänzen')).toBeNull()
    fireEvent.click(screen.getByText('Riester-Angaben ergänzen'))
    expect(onCompleteRiester).toHaveBeenCalled()
    expect(onCompleteDetails).not.toHaveBeenCalled()
  })

  it('missing child details lead to the Kinder screen; uncovered child cases are named', async () => {
    mock('offen', ['kinder', 'anlageKindVolljaehrig'])
    const { onCompleteChildren } = renderScreen()
    expect(await screen.findByText(/Für die Anlage Kind fehlen noch Angaben zu deinen Kindern/)).toBeTruthy()
    expect(screen.getByText(/Angaben zu einem volljährigen Kind \(Anlage Kind\) gibt es den Ausdruck noch nicht/)).toBeTruthy()
    fireEvent.click(screen.getByText('Kinder-Angaben ergänzen'))
    expect(onCompleteChildren).toHaveBeenCalled()
  })

  it('missing cross-border facts lead to the Grenzgänger screen', async () => {
    mock('offen', ['grenzgaenger'])
    const { onCompleteCrossBorder } = renderScreen()
    expect(await screen.findByText(/Für die Anlage N-Gre fehlen noch Angaben/)).toBeTruthy()
    fireEvent.click(screen.getByText('Grenzgänger-Angaben ergänzen'))
    expect(onCompleteCrossBorder).toHaveBeenCalled()
  })

  it('missing capital facts lead to the Kapital screen', async () => {
    mock('offen', ['kapital'])
    const { onCompleteCapital } = renderScreen()
    expect(await screen.findByText(/Für die Anlage KAP fehlen noch Angaben/)).toBeTruthy()
    fireEvent.click(screen.getByText('Kapital-Angaben ergänzen'))
    expect(onCompleteCapital).toHaveBeenCalled()
  })

  it('missing rental facts lead to the Vermietung screen', async () => {
    mock('offen', ['vermietung'])
    const { onCompleteRental } = renderScreen()
    expect(await screen.findByText(/Für die Anlage V fehlen noch Angaben zu deiner Vermietung/)).toBeTruthy()
    fireEvent.click(screen.getByText('Vermietungs-Angaben ergänzen'))
    expect(onCompleteRental).toHaveBeenCalled()
  })

  it('an Anlage that is not printable yet is named, and paying is not offered', async () => {
    mock('offen', ['anlageV'])
    renderScreen()
    expect(await screen.findByText(/Für deine Vermietung \(Anlage V\) gibt es den Ausdruck noch nicht/)).toBeTruthy()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByText('Angaben ergänzen')).toBeNull()
  })

  it('REQ-032: unconfirmed values block like missing ones, name their Anlagen and lead to „Prüfen & bestätigen“', async () => {
    mock('offen', ['unbestaetigt.anlageN', 'unbestaetigt.anlageKap'])
    const { onConfirm } = renderScreen()

    expect(await screen.findByText('Noch nicht bestätigt: Anlage N, Anlage KAP. Prüf die neuen Werte und bestätige sie – erst dann kannst du drucken.')).toBeTruthy()
    // Not mistaken for missing Stammdaten.
    expect(screen.queryByText('Ergänze zuerst deine Angaben für die Steuererklärung.')).toBeNull()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByText('Prüfen & bestätigen'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('REQ-032: in a joint return, Person B\'s unconfirmed values are named too', async () => {
    mock('offen', ['unbestaetigt.personB'])
    renderScreen()

    expect(await screen.findByText('Die zweite Person eurer gemeinsamen Erklärung muss in der eigenen App noch Werte bestätigen.')).toBeTruthy()
    expect(screen.queryByText(/Noch nicht bestätigt/)).toBeNull()
  })

  it('payment not configured on this environment: says so, offers nothing to click', async () => {
    mock('nicht-verfuegbar')
    renderScreen()
    expect(await screen.findByText('Die Bezahlung ist auf dieser Umgebung noch nicht eingerichtet.')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
  })
})
