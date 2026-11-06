// Kapital-Screen (REQ-025, ticket 10.5) — renders the depot-Einordnung (server-derived), the
// Kapitalerträge field from GET, sends whole numbers via PUT, and shows the derived Posten with
// Herkunft. The § 32d Abs. 6 Günstigerprüfung renders `kind` FIRST (ADR-0034): eindeutig with
// Empfehlung, zu-knapp/unbestimmt as honest no-verdict states, nicht-anwendbar naming the gate.
// The client stays dumb: the fold and the comparison come from the server.
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { CapitalScreen } from './KapitalScreen'
import { server } from '../../test-msw-server'
import type { KapitalResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const CAPITAL_URL = `*/v1/steuerjahre/${TAX_YEAR}/kapital`
const GP_URL = `*/v1/steuerjahre/${TAX_YEAR}/kapital/guenstigerpruefung`

const GERMAN_BROKER: KapitalResponseDto = {
  kapitalertraege: { kind: 'erfasst', value: 20000 },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege', 'sparerPauschbetrag', 'kapitalertragsteuer', 'solidaritaetszuschlag', 'kirchensteuer'],
  depot: { kind: 'deutscher-broker' },
  items: [{ id: 'kapital', amount: 20000, provenance: 'eingabe' }],
  status: { kind: 'bestimmt', einnahmen: 20000, vorsorgeaufwand: 0, anrechnung: 0 },
  inhaber: null,
}

const UNAMBIGUOUS_FLAT_RATE = {
  kind: 'eindeutig',
  recommendation: 'abgeltung',
  flatRateTax: 4750,
  personal: 8482,
  delta: 3732,
  uncertainty: { kind: 'bestimmt', upperLimit: 0 },
  provenance: {
    kapitalertraege: 20000,
    remainingZvE: 60000,
    saversAllowance: 1000,
    assessmentType: 'einzel',
    components: ['einkommensteuer', 'solidaritaetszuschlag'],
  },
}

function renderCapital() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CapitalScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('KapitalScreen', () => {
  it('renders the depot-Einordnung and the Kapitalerträge field from the GET response', async () => {
    renderCapital()

    expect(await screen.findByText('Kapitalerträge (Einkünfte aus Kapitalvermögen)')).toBeTruthy()
    // The default mask has no kap-depot answer yet — the honest "unbekannt" notice, never a guess.
    expect(screen.getByText(/ob dein Depot bei einem deutschen oder ausländischen Broker liegt/)).toBeTruthy()
  })

  it('asks a couple whose depot it is and saves the answer (ADR-0054)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })),
      http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () => HttpResponse.json({ filingType: 'zusammen' })),
      http.put(`${CAPITAL_URL}/inhaber`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(GERMAN_BROKER, { status: 200 })
      }),
    )
    renderCapital()
    fireEvent.click(await screen.findByTestId('kapital-inhaber-gemeinsam'))
    await waitFor(() => expect(bodies).toEqual([{ inhaber: 'gemeinsam' }]))
  })

  it('does not ask single people whose depot it is', async () => {
    server.use(http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()
    await screen.findByText(/Abgeltungsteuer einbehalten/)
    expect(screen.queryByTestId('kapital-inhaber-gemeinsam')).toBeNull()
  })

  it('renders the German-broker notice (Abgeltungsteuer withheld) from the GET response', async () => {
    server.use(http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()

    expect(await screen.findByText(/Abgeltungsteuer einbehalten/)).toBeTruthy()
  })

  it('shows the derived Posten with its Herkunft once determined', async () => {
    server.use(http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()

    expect(await screen.findByText('Deine Kapitalerträge')).toBeTruthy()
    expect(screen.getByText('20000 €')).toBeTruthy()
    expect(screen.getByText('Eingabe aus deiner Jahressteuerbescheinigung')).toBeTruthy()
  })

  it('a German broker also asks the withheld taxes and the used Sparer-Pauschbetrag (Anlage KAP)', async () => {
    let url = ''
    server.use(http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })))
    server.use(
      http.put(`${CAPITAL_URL}/:feld`, ({ request }) => {
        url = request.url
        return HttpResponse.json(GERMAN_BROKER, { status: 200 })
      }),
    )
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()
    expect(await screen.findByText('Bereits genutzter Sparer-Pauschbetrag (laut Steuerbescheinigung, ggf. 0)')).toBeTruthy()
    const input = screen.getByLabelText(/Einbehaltene Kapitalertragsteuer/)
    fireEvent.change(input, { target: { value: '4750' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(url).toContain('/kapital/kapitalertragsteuer'))
  })

  it('PUTs the captured Kapitalerträge as whole euros', async () => {
    let body: unknown
    let url = ''
    server.use(
      http.put(`${CAPITAL_URL}/kapitalertraege`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json(GERMAN_BROKER, { status: 200 })
      }),
    )
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderCapital()
    await screen.findByText('Kapitalerträge (Einkünfte aus Kapitalvermögen)')

    const input = screen.getByLabelText(/Kapitalerträge \(Einkünfte aus Kapitalvermögen\)/)
    fireEvent.change(input, { target: { value: '20000' } })
    // react-native-web fires onSubmitEditing from its keyDown handler on Enter.
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ kind: 'erfasst', value: 20000 }))
    expect(url).toContain('/kapital/kapitalertraege')
  })

  it('renders the Günstigerprüfung verdict FIRST — eindeutig with the recommendation', async () => {
    server.use(http.get(CAPITAL_URL, () => HttpResponse.json(GERMAN_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(UNAMBIGUOUS_FLAT_RATE, { status: 200 })))
    renderCapital()

    expect(await screen.findByTestId('guenstigerpruefung-aussage')).toBeTruthy()
    expect(screen.getByText('Die Abgeltungsteuer ist günstiger.')).toBeTruthy()
    expect(screen.getByText('4750 €')).toBeTruthy()
    expect(screen.getByText('8482 €')).toBeTruthy()
  })

  it('renders the honest no-verdict states and the foreign-broker KAP-Pflicht notice', async () => {
    server.use(
      http.get(CAPITAL_URL, () =>
        HttpResponse.json(
          { ...GERMAN_BROKER, depot: { kind: 'auslaendischer-broker' } },
          { status: 200 },
        ),
      ),
    )
    renderCapital()

    // Foreign broker: the KAP-Pflicht notice is shown, the Günstigerprüfung is never requested.
    expect(await screen.findByText(/keine deutsche Steuer abgeführt/)).toBeTruthy()
    expect(screen.queryByTestId('guenstigerpruefung-aussage')).toBeNull()
  })

  it('shows the honest Krypto gate statement', async () => {
    server.use(
      http.get(CAPITAL_URL, () =>
        HttpResponse.json(
          { ...GERMAN_BROKER, depot: { kind: 'krypto' }, status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0, gated: ['Kapital'] } },
          { status: 200 },
        ),
      ),
    )
    renderCapital()

    expect(await screen.findByText(/Krypto bleibt in 1.0 ehrlich außen vor/)).toBeTruthy()
  })
})
