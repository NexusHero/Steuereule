// The return trip from the self-employment checkout on the ELSTER page, per outcome (WEB-35, WEB-1
// lock): the page never says "unlocked" and "not unlocked" at once, and offers no second payment while
// the payment is being confirmed. Plus the price before the redirect on the unlock page (WEB-16).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { PaymentReturn } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { manualPaymentClock, type ManualPaymentClock } from '../../test-payment-clock'
import { BASE_URL, renderBusiness, useElsterForms } from './businessTestKit'
import { ElsterPage } from './ElsterPage'

const CONFIRMING = 'Deine Zahlung wird bestätigt. Das dauert meist nur Sekunden – du musst nichts weiter tun.'
const PAID = 'Zahlung bestätigt: 2025 ist freigeschaltet.'
const CANCELLED = 'Die Zahlung wurde abgebrochen, es wurde nichts bezahlt. Du kannst es jederzeit erneut versuchen.'
const TIMEOUT = 'Die Bestätigung dauert länger als üblich. Hast du bezahlt, schalten wir 2025 frei, sobald die Zahlung bei uns eingeht. Ein zweites Mal bezahlen musst du nicht.'
const NOT_UNLOCKED = 'Die Ausfüllhilfe für 2025 ist noch nicht freigeschaltet.'
const HELP = { form: 'anlage-euer', year: 2025, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] }

/** The webhook arrives after `lateBy` status reads: until then the status is `offen` and the help answers 402. */
function webhookAfter(lateBy: number) {
  let reads = 0
  const paid = () => reads > lateBy
  server.use(
    http.get('*/v1/steuerjahre/2025/freischaltung', () => {
      reads += 1
      return HttpResponse.json({ status: paid() ? 'freigeschaltet' : 'offen', tier: 'selbststaendig' })
    }),
    http.get(`${BASE_URL}/elster`, () => (paid() ? HttpResponse.json({ year: 2025, forms: [{ form: 'anlage-euer', group: 'business', instance: null }] }) : HttpResponse.json({ code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'x' }, { status: 402 }))),
    http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json(HELP)),
  )
  return () => reads
}

function renderElster(payment: PaymentReturn | undefined, clock: ManualPaymentClock = manualPaymentClock()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onOpenPage = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <ElsterPage taxYear={2025} person="A" onBack={() => {}} onOpenPage={onOpenPage} payment={payment} confirmTiming={{ clock }} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onOpenPage, client }
}

afterEach(() => server.resetHandlers())

describe('ELSTER page: an unlock that was taken back', () => {
  it('says "not unlocked" when a reload answers 402, although the help was loaded before (a refund)', async () => {
    let refunded = false
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: refunded ? 'offen' : 'freigeschaltet', tier: 'selbststaendig' })),
      http.get(`${BASE_URL}/elster`, () =>
        refunded
          ? HttpResponse.json({ code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'x' }, { status: 402 })
          : HttpResponse.json({ year: 2025, forms: [{ form: 'anlage-euer', group: 'business', instance: null }] }),
      ),
      http.get(`${BASE_URL}/elster/anlage-euer`, () => (refunded ? HttpResponse.json({ code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'x' }, { status: 402 }) : HttpResponse.json(HELP))),
    )
    const { client } = renderElster(undefined)
    expect(await screen.findByTestId('elster-zeilen')).toBeTruthy()
    refunded = true
    await client.refetchQueries()
    expect(await screen.findByText(NOT_UNLOCKED)).toBeTruthy()
  })
})

describe('ELSTER page: back from Stripe', () => {
  it('success, already paid: says the payment is confirmed and shows the help', async () => {
    webhookAfter(0)
    renderElster('erfolg')
    expect(await screen.findByText(PAID)).toBeTruthy()
    expect(await screen.findByTestId('elster-zeilen')).toBeTruthy()
    expect(screen.queryByText(NOT_UNLOCKED)).toBeNull()
  })

  it('success, webhook late: confirming, never "not unlocked" and no pay button, then paid and the help', async () => {
    // The test moves the clock: the webhook is in after the third status read, which the polls bring about.
    const clock = manualPaymentClock()
    const reads = webhookAfter(3)
    renderElster('erfolg', clock)
    expect(await screen.findByText(CONFIRMING)).toBeTruthy()
    expect(screen.queryByText(NOT_UNLOCKED)).toBeNull()
    expect(screen.queryByTestId('elster-freischalten')).toBeNull()

    while (reads() <= 3) {
      const before = reads()
      clock.poll()
      await waitFor(() => expect(reads()).toBeGreaterThan(before))
    }
    expect(await screen.findByText(PAID)).toBeTruthy()
    expect(await screen.findByTestId('elster-zeilen')).toBeTruthy()
    expect(screen.queryByText(CONFIRMING)).toBeNull()
    expect(screen.queryByText(NOT_UNLOCKED)).toBeNull()
  })

  it('cancel: says nothing was paid; the help still leads to the unlock', async () => {
    webhookAfter(Number.POSITIVE_INFINITY)
    renderElster('abbruch')
    expect(await screen.findByText(CANCELLED)).toBeTruthy()
    expect(await screen.findByTestId('elster-freischalten')).toBeTruthy()
    expect(screen.queryByText(PAID)).toBeNull()
  })

  it('timeout: says so plainly and never "paid"; checking again reads the status again', async () => {
    const clock = manualPaymentClock()
    const reads = webhookAfter(Number.POSITIVE_INFINITY)
    renderElster('erfolg', clock)
    expect(await screen.findByText(CONFIRMING)).toBeTruthy()
    clock.expire()
    expect(await screen.findByText(TIMEOUT)).toBeTruthy()
    expect(screen.queryByText(PAID)).toBeNull()
    const before = reads()
    fireEvent.click(screen.getByTestId('elster-zahlung-erneut-pruefen'))
    await waitFor(() => expect(reads()).toBeGreaterThan(before))
  })
})

describe('unlock page: the price before the redirect (WEB-16)', () => {
  it('names the self-employment price the status reports', async () => {
    useElsterForms()
    server.use(http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: 'offen', tier: 'selbststaendig', price: { amountCents: 8999, currency: 'eur' } })))
    renderBusiness('freischalten')
    await waitFor(() => expect(screen.getByTestId('checkout-preis').textContent?.replace(/ /g, ' ')).toBe('Preis: 89,99 € einmalig für 2025.'))
  })

  it('already paid: says so and leads to the fill-in help instead of a second payment', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2025/freischaltung', () => HttpResponse.json({ status: 'offen', tier: 'selbststaendig', price: null })),
      http.post(`${BASE_URL}/checkout`, () => HttpResponse.json({ code: 'ALREADY_PAID', message: 'x' }, { status: 409 })),
    )
    const onOpenPage = vi.fn()
    renderBusiness('freischalten', { onOpenPage })
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    expect(await screen.findByText('2025 ist schon freigeschaltet.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('checkout-zur-ausfuellhilfe'))
    expect(onOpenPage).toHaveBeenCalledWith('elster')
  })
})
