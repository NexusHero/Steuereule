// Rentner-Screen (REQ-022, ticket 10.4) — renders the Rentenart picker + the Jahresbetrag from
// GET, sends whole numbers via PUT, and shows the derived taxable share with its § 22 Herkunft.
// Honest loading/error states. The client stays dumb: the fold comes from the server.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { RentnerScreen } from './RentnerScreen'
import { server } from '../../test-msw-server'
import type { RenteResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const RENTE_URL = `*/v1/steuerjahre/${TAX_YEAR}/rente`

const GESETZLICHE_RENTE: RenteResponseDto = {
  art: 'GesetzlicheRente',
  jahresbetrag: { kind: 'erfasst', wert: 20000 },
  rentenbeginnJahr: { kind: 'erfasst', wert: 2020 },
  alterBeiRentenbeginn: { kind: 'offen' },
  posten: [{ id: 'rente', betrag: 16000, herkunft: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' }],
  stand: { kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 },
}

function renderRentner() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <RentnerScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('RentnerScreen', () => {
  it('renders the Rentenart picker and the Jahresbetrag field from the GET response', async () => {
    renderRentner()

    expect(await screen.findByText('Welche Rente beziehst du?')).toBeTruthy()
    expect(screen.getByText('Gesetzliche Rente')).toBeTruthy()
    expect(screen.getByText('Betriebsrente / PK')).toBeTruthy()
    expect(screen.getByText('Jahresbetrag der Rente')).toBeTruthy()
  })

  it('shows the derived taxable share with its § 22 Herkunft once determined', async () => {
    server.use(http.get(RENTE_URL, () => HttpResponse.json(GESETZLICHE_RENTE, { status: 200 })))
    renderRentner()

    expect(await screen.findByText('Steuerpflichtiger Anteil')).toBeTruthy()
    expect(screen.getByText('16000 €')).toBeTruthy()
    expect(screen.getByText('§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %')).toBeTruthy()
  })

  it('PUTs the chosen Rentenart', async () => {
    let body: unknown
    let url = ''
    server.use(
      http.put(`${RENTE_URL}/art`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json({ ...GESETZLICHE_RENTE, art: 'GesetzlicheRente' }, { status: 200 })
      }),
    )
    renderRentner()
    await screen.findByText('Welche Rente beziehst du?')

    fireEvent.click(screen.getByText('Gesetzliche Rente'))

    await waitFor(() => expect(body).toEqual({ art: 'GesetzlicheRente' }))
    expect(url).toContain('/rente/art')
  })

  it('PUTs the honest "unklar" state when the unreadable fallback is tapped', async () => {
    let body: unknown
    let url = ''
    server.use(
      http.put(`${RENTE_URL}/jahresbetrag`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json({ ...GESETZLICHE_RENTE, jahresbetrag: { kind: 'unklar' } }, { status: 200 })
      }),
    )
    renderRentner()
    await screen.findByText('Jahresbetrag der Rente')

    const unklarButtons = screen.getAllByText('unlesbar')
    fireEvent.click(unklarButtons[0]!)

    await waitFor(() => expect(body).toEqual({ kind: 'unklar' }))
    expect(url).toContain('/rente/jahresbetrag')
  })
})
