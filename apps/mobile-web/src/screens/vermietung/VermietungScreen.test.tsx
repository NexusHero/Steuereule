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
import { RentalScreen } from './VermietungScreen'
import { server } from '../../test-msw-server'
import type { RentalResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const RENTAL_URL = `*/v1/steuerjahre/${TAX_YEAR}/vermietung`

const FULL_PROPERTY: RentalResponseDto = {
  classification: { kind: 'einfach' },
  properties: [
    {
      id: 'obj-1',
      mieteinnahmen: { kind: 'erfasst', value: 12000 },
      anschaffungskosten: { kind: 'erfasst', value: 200000 },
      baujahr: { kind: 'erfasst', value: 1990 },
      werbungskosten: { kind: 'erfasst', value: 1500 },
      strasse: null,
      hausnummer: null,
      plz: null,
      city: null,
      livingArea: null,
      depreciationAsLastYear: null,
      umlagen: null,
      schuldzinsen: null,
      einheiten: null,
      anteilA: null,
      facts: {
        einnahmen: 12000,
        werbungskosten: 1500,
        depreciation: { amount: 4000, provenance: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        openItems: 0,
      },
    },
  ],
  status: { kind: 'bestimmt', einnahmen: 12000, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 1500, depreciation: 4000, openItems: 0, conflicts: 0 },
}

function renderRental() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <RentalScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('VermietungScreen', () => {
  it('renders the empty state with the honest "unbekannt" Einordnung and the add CTA', async () => {
    renderRental()

    expect(await screen.findByText(/ob du vermietest/)).toBeTruthy()
    expect(screen.getByTestId('objekt-hinzufuegen')).toBeTruthy()
  })

  it('renders the object\'s fields and its derived facts with the § 7 Abs. 4 Herkunft', async () => {
    server.use(http.get(RENTAL_URL, () => HttpResponse.json(FULL_PROPERTY, { status: 200 })))
    renderRental()

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
      http.post(`${RENTAL_URL}/objekte`, ({ request }) => {
        postUrl = request.url
        return HttpResponse.json(FULL_PROPERTY, { status: 201 })
      }),
    )
    renderRental()
    await screen.findByTestId('objekt-hinzufuegen')

    fireEvent.click(screen.getByTestId('objekt-hinzufuegen'))

    await waitFor(() => expect(postUrl).toContain('/vermietung/objekte'))
  })

  it('PUTs the captured Mieteinnahmen as whole euros', async () => {
    let body: unknown
    let url = ''
    server.use(http.get(RENTAL_URL, () => HttpResponse.json(FULL_PROPERTY, { status: 200 })))
    server.use(
      http.put(`${RENTAL_URL}/objekte/:objektId/:feld`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json(FULL_PROPERTY, { status: 200 })
      }),
    )
    renderRental()
    const input = await screen.findByLabelText(/Mieteinnahmen \(Jahreskaltmiete\)/)
    fireEvent.change(input, { target: { value: '13500' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ kind: 'erfasst', value: 13500 }))
    expect(url).toContain('/vermietung/objekte/obj-1/mieteinnahmen')
  })

  it('asks whether the AfA is unchanged from last year (Anlage V Zeile 33) and saves it with the object', async () => {
    let body: unknown
    server.use(http.get(RENTAL_URL, () => HttpResponse.json(FULL_PROPERTY, { status: 200 })))
    server.use(
      http.put(`${RENTAL_URL}/objekte/:objektId/adresse`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(FULL_PROPERTY, { status: 200 })
      }),
    )
    renderRental()
    fireEvent.click(await screen.findByTestId('vermietung-afa-wie-vorjahr-ja'))
    await waitFor(() => expect(body).toEqual({ depreciationAsLastYear: true }))
  })

  it('saves Umlagen and Schuldzinsen with the object, and asks the share only in a joint return', async () => {
    const bodies: unknown[] = []
    server.use(http.get(RENTAL_URL, () => HttpResponse.json(FULL_PROPERTY, { status: 200 })))
    server.use(
      http.put(`${RENTAL_URL}/objekte/:objektId/adresse`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(FULL_PROPERTY, { status: 200 })
      }),
    )
    renderRental()
    fireEvent.change(await screen.findByLabelText('Umlagen / Nebenkosten, die die Mieter gezahlt haben (€ im Jahr)'), { target: { value: '4200' } })
    fireEvent.change(screen.getByLabelText('Schuldzinsen für das Objekt, ohne Tilgung (€ im Jahr)'), { target: { value: '6100' } })
    await waitFor(() => expect(bodies).toEqual([{ umlagen: '4200' }, { schuldzinsen: '6100' }]))
    expect(screen.queryByLabelText('Dein Anteil am Objekt in % (der Rest gehört deinem Partner)')).toBeNull()
  })

  it('names the Verkauf/möbliert gate honestly and hides the add CTA', async () => {
    server.use(
      http.get(RENTAL_URL, () =>
        HttpResponse.json(
          {
            ...FULL_PROPERTY,
            classification: { kind: 'verkauf-oder-moebliert' },
            properties: [],
            status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 0, conflicts: 0, gated: ['Vermietung'] },
          },
          { status: 200 },
        ),
      ),
    )
    renderRental()

    expect(await screen.findByText(/Verkauf oder möbliert-auf-Zeit bleibt in 1.0 ehrlich außen vor/)).toBeTruthy()
    expect(screen.queryByTestId('objekt-hinzufuegen')).toBeNull()
  })
})
