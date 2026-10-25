// Vermietung-Screen (REQ-026, ticket 10.6) — renders the Einordnung (server-derived), the
// objects with their four honest fields and derived facts (Miete, Werbungskosten, AfA with its
// § 7 Abs. 4 Herkunft), POSTs new objects and PUTs whole euros. The Verkauf/möbliert gate is
// named honestly (ADR-033). The client stays dumb: every number comes from the server.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { VermietungScreen } from './VermietungScreen'
import { server } from '../../test-msw-server'
import type { VermietungResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const VERMIETUNG_URL = `*/v1/steuerjahre/${TAX_YEAR}/vermietung`

const VOLLES_OBJEKT: VermietungResponseDto = {
  einordnung: { kind: 'einfach' },
  objekte: [
    {
      id: 'obj-1',
      mieteinnahmen: { kind: 'erfasst', wert: 12000 },
      anschaffungskosten: { kind: 'erfasst', wert: 200000 },
      baujahr: { kind: 'erfasst', wert: 1990 },
      werbungskosten: { kind: 'erfasst', wert: 1500 },
      fakten: {
        einnahmen: 12000,
        werbungskosten: 1500,
        afa: { betrag: 4000, herkunft: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        offenePosten: 0,
      },
    },
  ],
  stand: { kind: 'bestimmt', einnahmen: 12000, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 1500, afa: 4000, offenePosten: 0, konflikte: 0 },
}

function renderVermietung() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <VermietungScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('VermietungScreen', () => {
  it('renders the empty state with the honest "unbekannt" Einordnung and the add CTA', async () => {
    renderVermietung()

    expect(await screen.findByText(/ob du vermietest/)).toBeTruthy()
    expect(screen.getByTestId('objekt-hinzufuegen')).toBeTruthy()
  })

  it('renders the object\'s fields and its derived facts with the § 7 Abs. 4 Herkunft', async () => {
    server.use(http.get(VERMIETUNG_URL, () => HttpResponse.json(VOLLES_OBJEKT, { status: 200 })))
    renderVermietung()

    expect(await screen.findByText('Objekt 1')).toBeTruthy()
    expect(screen.getByText('Mieteinnahmen (Jahreskaltmiete)')).toBeTruthy()
    // The per-object facts AND the total use the same label — both must render.
    expect(screen.getAllByText('Mieteinnahmen: 12.000 €').length).toBe(2)
    expect(screen.getAllByText('Werbungskosten: 1.500 €').length).toBe(2)
    expect(screen.getAllByText('Lineare AfA: 4.000 €').length).toBe(2)
    expect(screen.getByText('§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990')).toBeTruthy()
  })

  it('POSTs a new object when "Weiteres Objekt hinzufügen" is tapped', async () => {
    let postUrl = ''
    server.use(
      http.post(`${VERMIETUNG_URL}/objekte`, ({ request }) => {
        postUrl = request.url
        return HttpResponse.json(VOLLES_OBJEKT, { status: 201 })
      }),
    )
    renderVermietung()
    await screen.findByTestId('objekt-hinzufuegen')

    fireEvent.click(screen.getByTestId('objekt-hinzufuegen'))

    await waitFor(() => expect(postUrl).toContain('/vermietung/objekte'))
  })

  it('PUTs the captured Mieteinnahmen as whole euros', async () => {
    let body: unknown
    let url = ''
    server.use(http.get(VERMIETUNG_URL, () => HttpResponse.json(VOLLES_OBJEKT, { status: 200 })))
    server.use(
      http.put(`${VERMIETUNG_URL}/objekte/:objektId/:feld`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json(VOLLES_OBJEKT, { status: 200 })
      }),
    )
    renderVermietung()
    const input = await screen.findByLabelText(/Mieteinnahmen \(Jahreskaltmiete\)/)
    fireEvent.change(input, { target: { value: '12000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ kind: 'erfasst', wert: 12000 }))
    expect(url).toContain('/vermietung/objekte/obj-1/mieteinnahmen')
  })

  it('names the Verkauf/möbliert gate honestly and hides the add CTA', async () => {
    server.use(
      http.get(VERMIETUNG_URL, () =>
        HttpResponse.json(
          {
            ...VOLLES_OBJEKT,
            einordnung: { kind: 'verkauf-oder-moebliert' },
            objekte: [],
            stand: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, afa: 0, offenePosten: 0, konflikte: 0, gegated: ['Vermietung'] },
          },
          { status: 200 },
        ),
      ),
    )
    renderVermietung()

    expect(await screen.findByText(/Verkauf oder möbliert-auf-Zeit bleibt in 1.0 ehrlich außen vor/)).toBeTruthy()
    expect(screen.queryByTestId('objekt-hinzufuegen')).toBeNull()
  })
})
