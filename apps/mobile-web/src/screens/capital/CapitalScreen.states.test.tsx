// The Kapital mask's remaining states: load error + retry, leaving, "unlesbar", answering the depot
// question in place, and every verdict of the Günstigerprüfung (each with its own honest statement).
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { KapitalResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { CapitalScreen } from './CapitalScreen'
import { server } from '../../test-msw-server'

const CAPITAL_URL = '*/v1/steuerjahre/2026/kapital'
const GP_URL = '*/v1/steuerjahre/2026/kapital/guenstigerpruefung'

const BASE: KapitalResponseDto = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege'],
  depot: { kind: 'deutscher-broker' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0 },
  inhaber: null,
} as KapitalResponseDto

function renderCapital(props: { onDone?: () => void; onBack?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CapitalScreen taxYear={2026} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const mockCapital = (over: Partial<KapitalResponseDto> = {}) =>
  server.use(http.get(CAPITAL_URL, () => HttpResponse.json({ ...BASE, ...over }, { status: 200 })))
const mockVerdict = (body: object) => server.use(http.get(GP_URL, () => HttpResponse.json(body, { status: 200 })))

describe('CapitalScreen states', () => {
  it('shows an honest error and reloads on retry', async () => {
    let healthy = false
    server.use(http.get(CAPITAL_URL, () => (healthy ? HttpResponse.json(BASE, { status: 200 }) : HttpResponse.json(null, { status: 500 }))))
    renderCapital()

    expect(await screen.findByText('Das hat nicht geklappt.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))

    expect(await screen.findByText('Kapital & Depot')).toBeTruthy()
  })

  it('leaves through Zurück and Weiter, and survives Weiter without a handler', async () => {
    const onBack = vi.fn()
    const onDone = vi.fn()
    renderCapital({ onBack, onDone })
    await screen.findByText('Kapital & Depot')

    fireEvent.click(screen.getByLabelText('Zurück'))
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByTestId('kapital-weiter'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('does not crash on Weiter when no handler is wired', async () => {
    renderCapital()
    await screen.findByText('Kapital & Depot')
    expect(() => fireEvent.click(screen.getByTestId('kapital-weiter'))).not.toThrow()
  })

  it('records "unlesbar" for the Kapitalerträge', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(`${CAPITAL_URL}/kapitalertraege`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(BASE, { status: 200 })
      }),
    )
    renderCapital()
    await screen.findByText('Kapital & Depot')

    fireEvent.click(screen.getByText('unlesbar'))

    await waitFor(() => expect(bodies[0]).toEqual({ kind: 'unklar' }))
  })

  it('lets the user answer the depot question right on the mask and comes back to it', async () => {
    mockCapital({ depot: { kind: 'unbekannt' } as KapitalResponseDto['depot'] })
    renderCapital()

    fireEvent.click(await screen.findByTestId('kapital-frage-beantworten'))
    expect(screen.queryByText('Kapital & Depot')).toBeNull()
  })

  it('explains an unknown depot, a foreign broker and a German broker without withheld tax differently', async () => {
    mockCapital({ depot: { kind: 'deutscher-broker' } as KapitalResponseDto['depot'] })
    renderCapital()
    expect(await screen.findByText(/behält Abgeltungsteuer ein, sobald/)).toBeTruthy()
  })
})

describe('the Günstigerprüfung verdicts', () => {
  const figures = { flatRateTax: 100, personal: 50 }

  it('recommends the personal rate when it is clearly cheaper', async () => {
    mockCapital()
    mockVerdict({ kind: 'eindeutig', recommendation: 'persoenlich', ...figures, uncertainty: { kind: 'bestimmt', upperLimit: 0 } })
    renderCapital()
    expect(await screen.findByTestId('guenstigerpruefung-aussage')).toBeTruthy()
    expect(screen.getByText('Dein persönlicher Steuersatz ist günstiger.')).toBeTruthy()
  })

  it('says it is too close to call', async () => {
    mockCapital()
    mockVerdict({ kind: 'zu-knapp', ...figures })
    renderCapital()
    expect((await screen.findByTestId('guenstigerpruefung-aussage')).textContent).toBe('Zu knapp, um das zu sagen.')
  })

  it('shows the Progressionsvorbehalt hint when the verdict stays undetermined', async () => {
    mockCapital()
    mockVerdict({ kind: 'unbestimmt', ...figures, uncertainty: { kind: 'unbestimmt' } })
    renderCapital()
    expect(await screen.findByText(/Progressionsvorbehalt/)).toBeTruthy()
  })

  it.each([
    ['keine-abgeltung-einbehalten', 'Keine Abgeltungsteuer einbehalten — die Günstigerprüfung stellt sich hier nicht.'],
    ['krypto-gegated', 'Krypto bleibt 2.0 — keine Günstigerprüfung für Krypto.'],
    ['keine-kapitalertraege', 'Trag zuerst deine Kapitalerträge ein — dann rechnen wir den Vergleich.'],
    ['kap-depot-nicht-beantwortet', 'Erst die Depot-Frage im Interview beantworten — dann wissen wir, ob die Günstigerprüfung anwendbar ist.'],
  ])('names why it does not apply: %s', async (reason, expected) => {
    mockCapital()
    mockVerdict({ kind: 'nicht-anwendbar', reason })
    renderCapital()
    expect(await screen.findByText(expected)).toBeTruthy()
  })

  it('shows nothing when there is no verdict', async () => {
    mockCapital()
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()
    await screen.findByText('Kapital & Depot')
    expect(screen.queryByTestId('guenstigerpruefung-aussage')).toBeNull()
  })
})
