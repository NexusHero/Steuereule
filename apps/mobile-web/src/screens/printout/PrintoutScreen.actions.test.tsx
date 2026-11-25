// AusdruckScreen — payment and download failures, the retry, and where each "inspect" from the
// preview leads. The preview itself is stubbed: it is tested in GlassFormPreview.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Screen } from '@steuereule/core'
import { server } from '../../test-msw-server'
import { manualPaymentClock } from '../../test-payment-clock'
import { PaymentClockProvider } from '../shared/usePaymentConfirmation'
import { PrintoutScreen, type PrintoutScreenProps } from './PrintoutScreen'
import { renderWithQuery } from '../../test-render'

const { download } = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('../privacy/exportDownload', () => ({ triggerBrowserDownload: download }))
vi.mock('./GlassFormPreview', async () => {
  const { Pressable, Text } = await import('react-native')
  const cases: Array<[Screen, string | undefined]> = [
    ['stammdaten', undefined],
    ['profil', undefined],
    ['kopplung', undefined],
    ['chLohnausweis', undefined],
    ['kapital', undefined],
    ['vermietung', undefined],
    ['kind', undefined],
    ['interview', 'riester.beitrag'],
    ['interview', 'other'],
    ['lstb', undefined],
  ]
  return {
    GlassFormPreview: ({ onInspectField }: { onInspectField: (screen: Screen, field?: string) => void }) => (
      <>
        {cases.map(([target, field], index) => (
          <Pressable key={index} accessibilityRole="button" onPress={() => onInspectField(target, field)} testID={`inspect-${index}`}>
            <Text>{`${target} ${field ?? ''}`}</Text>
          </Pressable>
        ))}
      </>
    ),
  }
})

function mock(status: string, missing: string[] = []) {
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status })),
    http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing })),
  )
}

function handlers() {
  return {
    onBack: vi.fn(),
    onCompleteDetails: vi.fn(),
    onCompleteRiester: vi.fn(),
    onCompleteChildren: vi.fn(),
    onCompleteRental: vi.fn(),
    onCompleteCapital: vi.fn(),
    onCompleteCrossBorder: vi.fn(),
    onConfirm: vi.fn(),
  }
}

function renderScreen(props: Partial<PrintoutScreenProps> = {}, clock = manualPaymentClock()) {
  const h = handlers()
  renderWithQuery(
    <PaymentClockProvider value={clock}>
      <PrintoutScreen year={2025} {...h} {...props} />
    </PaymentClockProvider>,
  )
  return h
}

beforeEach(() => download.mockClear())
afterEach(() => server.resetHandlers())

describe('AusdruckScreen — loading', () => {
  it('says that loading failed and loads again on retry', async () => {
    let calls = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ status: 'offen' })
      }),
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing: [] })),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('Noch mal versuchen'))
    expect(await screen.findByTestId('ausdruck-bezahlen')).toBeTruthy()
  })

  it('leaves through the back button of the header', async () => {
    mock('offen')
    const { onBack } = renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-zurueck'))
    expect(onBack).toHaveBeenCalled()
  })

  it('leaves from the running-year notice', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/freischaltung', () => HttpResponse.json({ status: 'offen' })),
      http.get('*/v1/steuerjahre/2026/ausdruck/pruefung', () => HttpResponse.json({ missing: [] })),
    )
    const { onBack } = renderScreen({ year: 2026 })
    fireEvent.click(await screen.findByText('Zurück'))
    expect(onBack).toHaveBeenCalled()
  })

  it('leaves from the notice that a year has no Vordrucke', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: 'offen' })),
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ code: 'VORDRUCKE_MISSING' }, { status: 404 })),
    )
    const { onBack } = renderScreen()
    fireEvent.click(await screen.findByText('Zurück'))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('AusdruckScreen — payment', () => {
  it('says so when the checkout cannot be started', async () => {
    mock('offen')
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.json({ message: 'no' }, { status: 502 })))
    const openCheckout = vi.fn()
    renderScreen({ openCheckout })
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    // The shared wording (WEB-10): a server failure says so, never the server's text.
    expect(await screen.findByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(openCheckout).not.toHaveBeenCalled()
  })

  it('says so when the checkout request never arrives', async () => {
    mock('offen')
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.error()))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    expect(await screen.findByText('Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.')).toBeTruthy()
  })

  it('names a cancelled payment and offers to pay again', async () => {
    mock('offen')
    renderScreen({ payment: 'abbruch' })
    expect(await screen.findByText('Die Zahlung wurde abgebrochen, es wurde nichts bezahlt. Du kannst es jederzeit erneut versuchen.')).toBeTruthy()
    expect(screen.getByTestId('ausdruck-bezahlen')).toBeTruthy()
  })

  it('does not name a cancelled payment once the printout is unlocked', async () => {
    mock('freigeschaltet')
    renderScreen({ payment: 'abbruch' })
    await screen.findByTestId('ausdruck-herunterladen')
    expect(screen.queryByText('Die Zahlung wurde abgebrochen, es wurde nichts bezahlt. Du kannst es jederzeit erneut versuchen.')).toBeNull()
  })

  it('asks the server again for the payment state while the payment is being confirmed', async () => {
    let reads = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => {
        reads += 1
        return HttpResponse.json({ status: 'offen' })
      }),
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing: [] })),
    )
    const clock = manualPaymentClock()
    renderScreen({ payment: 'erfolg' }, clock)
    await waitFor(() => expect(reads).toBe(1))
    for (const expected of [2, 3]) {
      clock.poll()
      await waitFor(() => expect(reads).toBe(expected))
    }
  })
})

describe('AusdruckScreen — download', () => {
  it('confirms a finished download', async () => {
    mock('freigeschaltet')
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', () => new HttpResponse(new Uint8Array([37, 80, 68, 70]), { status: 200 })))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-herunterladen'))
    expect(await screen.findByText('Heruntergeladen.')).toBeTruthy()
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'steuererklaerung-2025.pdf')
  })

  it('says so and re-checks what is missing when the server refuses with 422', async () => {
    mock('freigeschaltet')
    let checks = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => {
        checks += 1
        return HttpResponse.json({ missing: [] })
      }),
      http.get('*/v1/steuerjahre/2025/ausdruck', () => HttpResponse.json({ missing: ['iban'] }, { status: 422 })),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-herunterladen'))
    expect(await screen.findByText('Das hat nicht geklappt. Bitte versuch es noch mal.')).toBeTruthy()
    await waitFor(() => expect(checks).toBeGreaterThanOrEqual(2))
  })

  it('says so when the download request never arrives', async () => {
    mock('freigeschaltet')
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', () => HttpResponse.error()))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-herunterladen'))
    expect(await screen.findByText('Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.')).toBeTruthy()
  })

  it('names the wait of a rate-limited checkout (WEB-10)', async () => {
    mock('offen')
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.json({ statusCode: 429 }, { status: 429, headers: { 'Retry-After': '30' } })))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    expect(await screen.findByText('Gerade kommen zu viele Anfragen. Versuch es in 30 Sekunden noch mal.')).toBeTruthy()
  })
})

describe('AusdruckScreen — what is missing', () => {
  it('names the values that are too long for their box in the form', async () => {
    mock('offen', ['zuLang.anlKind.z67Text', 'zuLang.unbekannt'])
    renderScreen()
    const note = await screen.findByTestId('ausdruck-zu-lang')
    expect(note.textContent).toContain('Kinderbetreuung: Art und Anbieter (Anlage Kind)')
    expect(note.textContent).toContain('unbekannt')
  })

  it('says that Person B has to confirm and does not mistake it for missing details', async () => {
    mock('offen', ['unbestaetigt.personB', 'anlageV'])
    renderScreen()
    expect(await screen.findByText('Die zweite Person eurer gemeinsamen Erklärung muss in der eigenen App noch Werte bestätigen.')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-angaben-ergaenzen')).toBeNull()
  })
})

describe('AusdruckScreen — where "inspect" leads', () => {
  it('sends the preview’s requests to the screen that owns the value', async () => {
    mock('offen')
    const h = renderScreen()
    await screen.findByTestId('inspect-0')
    ;[0, 1, 2].forEach((i) => fireEvent.click(screen.getByTestId(`inspect-${i}`)))
    expect(h.onCompleteDetails).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByTestId('inspect-3'))
    expect(h.onCompleteCrossBorder).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('inspect-4'))
    expect(h.onCompleteCapital).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('inspect-5'))
    expect(h.onCompleteRental).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('inspect-6'))
    expect(h.onCompleteChildren).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('inspect-7'))
    expect(h.onCompleteRiester).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('inspect-8'))
    fireEvent.click(screen.getByTestId('inspect-9'))
    expect(h.onCompleteDetails).toHaveBeenCalledTimes(5)
  })

  it('hands the request to the host instead when it wants to route it itself', async () => {
    mock('offen')
    const onInspectField = vi.fn()
    const h = renderScreen({ onInspectField })
    fireEvent.click(await screen.findByTestId('inspect-7'))
    expect(onInspectField).toHaveBeenCalledWith('interview', 'riester.beitrag')
    expect(h.onCompleteRiester).not.toHaveBeenCalled()
  })
})
