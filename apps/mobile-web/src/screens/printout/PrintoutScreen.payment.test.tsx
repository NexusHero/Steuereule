// The return trip from Stripe on the printout, per outcome (WEB-1, WEB-35 lock): each test asserts the
// text the user reads, not only the page. Plus the price before the redirect (WEB-16), the refusals of
// a second checkout (API-4) and Person B of a joint return (WEB-15).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { PrintoutScreen, type PrintoutScreenProps } from './PrintoutScreen'

vi.mock('./GlassFormPreview', () => ({ GlassFormPreview: () => null }))

const CONFIRMING = 'Deine Zahlung wird bestätigt. Das dauert meist nur Sekunden – du musst nichts weiter tun.'
const PAID = 'Zahlung bestätigt: 2025 ist freigeschaltet.'
const CANCELLED = 'Die Zahlung wurde abgebrochen, es wurde nichts bezahlt. Du kannst es jederzeit erneut versuchen.'
const TIMEOUT = 'Die Bestätigung dauert länger als üblich. Hast du bezahlt, schalten wir 2025 frei, sobald die Zahlung bei uns eingeht. Ein zweites Mal bezahlen musst du nicht.'
const NOT_UNLOCKED_HINTS = [CONFIRMING, CANCELLED, TIMEOUT]

/** The unlock status answers in turn: the last answer repeats. */
function statusSequence(...answers: readonly object[]) {
  let reads = 0
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json(answers[Math.min(reads++, answers.length - 1)])),
    http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing: [] })),
  )
  return () => reads
}

function renderScreen(props: Partial<PrintoutScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onConfirm = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <PrintoutScreen
            year={2025}
            onBack={() => {}}
            onCompleteDetails={() => {}}
            onCompleteRiester={() => {}}
            onCompleteChildren={() => {}}
            onCompleteRental={() => {}}
            onCompleteCapital={() => {}}
            onCompleteCrossBorder={() => {}}
            onConfirm={onConfirm}
            confirmTiming={{ intervalMs: 20, timeoutMs: 400 }}
            {...props}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onConfirm }
}

afterEach(() => server.resetHandlers())

describe('printout: back from Stripe', () => {
  it('success, already paid: says the payment is confirmed and offers the download', async () => {
    statusSequence({ status: 'freigeschaltet' })
    renderScreen({ payment: 'erfolg' })
    expect(await screen.findByText(PAID)).toBeTruthy()
    expect(screen.getByTestId('ausdruck-herunterladen')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
  })

  it('success, webhook late: confirming with the pay button disabled, then paid without a reload', async () => {
    const reads = statusSequence({ status: 'offen', price: { amountCents: 3499, currency: 'eur' } }, { status: 'offen' }, { status: 'freigeschaltet' })
    renderScreen({ payment: 'erfolg' })
    expect(await screen.findByText(CONFIRMING)).toBeTruthy()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByText(PAID)).toBeNull()

    expect(await screen.findByText(PAID)).toBeTruthy()
    expect(reads()).toBeGreaterThanOrEqual(3)
    expect(screen.getByTestId('ausdruck-herunterladen')).toBeTruthy()
    for (const hint of NOT_UNLOCKED_HINTS) expect(screen.queryByText(hint)).toBeNull()
  })

  it('cancel: says nothing was paid and offers to pay again', async () => {
    statusSequence({ status: 'offen' })
    renderScreen({ payment: 'abbruch' })
    expect(await screen.findByText(CANCELLED)).toBeTruthy()
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).not.toBe('true')
    expect(screen.queryByText(CONFIRMING)).toBeNull()
    expect(screen.queryByText(PAID)).toBeNull()
  })

  it('timeout: says so plainly, never "paid", and offers to check again', async () => {
    const reads = statusSequence({ status: 'offen' })
    renderScreen({ payment: 'erfolg' })
    expect(await screen.findByText(CONFIRMING)).toBeTruthy()
    expect(await screen.findByText(TIMEOUT, undefined, { timeout: 3_000 })).toBeTruthy()
    expect(screen.queryByText(CONFIRMING)).toBeNull()
    expect(screen.queryByText(PAID)).toBeNull()
    // After the timeout paying is possible again: the API hands out the same session or reports it paid.
    expect(screen.getByTestId('ausdruck-bezahlen').getAttribute('aria-disabled')).not.toBe('true')

    const before = reads()
    fireEvent.click(screen.getByTestId('zahlung-erneut-pruefen'))
    expect(await screen.findByText(CONFIRMING)).toBeTruthy()
    await waitFor(() => expect(reads()).toBeGreaterThan(before))
  })

  it('no return trip: no payment message at all', async () => {
    statusSequence({ status: 'offen' })
    renderScreen()
    await screen.findByTestId('ausdruck-bezahlen')
    for (const hint of [...NOT_UNLOCKED_HINTS, PAID]) expect(screen.queryByText(hint)).toBeNull()
  })
})

describe('printout: the price before the redirect (WEB-16)', () => {
  it('names the price the status reports, from the checkout configuration', async () => {
    statusSequence({ status: 'offen', price: { amountCents: 3499, currency: 'eur' } })
    renderScreen()
    // Intl writes a no-break space between amount and sign.
    expect((await screen.findByTestId('ausdruck-preis')).textContent?.replace(/\u00a0/g, ' ')).toBe('Preis: 34,99 € einmalig für 2025.')
  })

  it('without a price says where it will be shown, and promises no number', async () => {
    statusSequence({ status: 'offen', price: null })
    renderScreen()
    expect((await screen.findByTestId('ausdruck-preis')).textContent).toBe('Den Preis zeigt dir unser Zahlungsdienst Stripe auf der nächsten Seite, bevor du bezahlst.')
  })
})

describe('printout: a second checkout is refused (API-4)', () => {
  it('already paid: says so and reads the status again', async () => {
    const reads = statusSequence({ status: 'offen' }, { status: 'freigeschaltet' })
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.json({ code: 'ALREADY_PAID', message: 'x' }, { status: 409 })))
    const openCheckout = vi.fn()
    renderScreen({ openCheckout })
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    expect(await screen.findByText('2025 ist schon freigeschaltet.')).toBeTruthy()
    await screen.findByTestId('ausdruck-herunterladen')
    expect(reads()).toBeGreaterThanOrEqual(2)
    expect(openCheckout).not.toHaveBeenCalled()
  })

  it('a payment still settling: says so', async () => {
    statusSequence({ status: 'offen' })
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.json({ code: 'PAYMENT_PENDING', message: 'x' }, { status: 409 })))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    expect(await screen.findByText('Deine Zahlung ist noch in Bearbeitung, etwa eine Lastschrift. Sobald sie eingeht, schalten wir 2025 frei.')).toBeTruthy()
  })

  it('throttled: says to wait', async () => {
    statusSequence({ status: 'offen' })
    server.use(http.post('*/v1/steuerjahre/2025/ausdruck/checkout', () => HttpResponse.json({ message: 'x' }, { status: 429 })))
    renderScreen()
    fireEvent.click(await screen.findByTestId('ausdruck-bezahlen'))
    expect(await screen.findByText('Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.')).toBeTruthy()
  })
})

describe('printout: Person B of a joint return (WEB-15)', () => {
  it('says who prints, offers no payment and no dead-end "Angaben ergänzen", and leads to confirming B’s own values', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: 'offen' })),
      http.get('*/v1/steuerjahre/2025/ausdruck/pruefung', () => HttpResponse.json({ missing: ['personADruckt'] })),
    )
    const { onConfirm } = renderScreen()
    expect(await screen.findByText('Euren Ausdruck druckt die Person, die eingeladen hat')).toBeTruthy()
    expect(screen.queryByTestId('ausdruck-bezahlen')).toBeNull()
    expect(screen.queryByTestId('ausdruck-angaben-ergaenzen')).toBeNull()
    expect(screen.queryByText('Für den Ausdruck fehlen noch Angaben')).toBeNull()
    fireEvent.click(screen.getByTestId('ausdruck-person-b-bestaetigen'))
    expect(onConfirm).toHaveBeenCalled()
  })
})
