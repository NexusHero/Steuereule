// Kapital-Screen (REQ-025, ticket 10.5) — renders the depot-Einordnung (server-derived), the
// Kapitalerträge field from GET, sends whole numbers via PUT, and shows the derived Posten with
// Herkunft. The § 32d Abs. 6 Günstigerprüfung renders `kind` FIRST (ADR-0034): eindeutig with
// Empfehlung, zu-knapp/unbestimmt as honest no-verdict states, nicht-anwendbar naming the gate.
// The client stays dumb: the fold and the comparison come from the server.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { KapitalScreen } from './KapitalScreen'
import { server } from '../../test-msw-server'
import type { KapitalResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const KAPITAL_URL = `*/v1/steuerjahre/${TAX_YEAR}/kapital`
const GP_URL = `*/v1/steuerjahre/${TAX_YEAR}/kapital/guenstigerpruefung`

const DEUTSCHER_BROKER: KapitalResponseDto = {
  kapitalertraege: { kind: 'erfasst', wert: 20000 },
  depot: { kind: 'deutscher-broker' },
  posten: [{ id: 'kapital', betrag: 20000, herkunft: 'eingabe' }],
  stand: { kind: 'bestimmt', einnahmen: 20000, vorsorgeaufwand: 0, anrechnung: 0 },
}

const EINDEUTIG_ABGELTUNG = {
  kind: 'eindeutig',
  empfehlung: 'abgeltung',
  abgeltung: 4750,
  persoenlich: 8482,
  delta: 3732,
  unschaerfe: { kind: 'bestimmt', obergrenze: 0 },
  herkunft: {
    kapitalertraege: 20000,
    uebrigesZvE: 60000,
    sparerpauschbetrag: 1000,
    veranlagung: 'einzel',
    bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'],
  },
}

function renderKapital() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <KapitalScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('KapitalScreen', () => {
  it('renders the depot-Einordnung and the Kapitalerträge field from the GET response', async () => {
    renderKapital()

    expect(await screen.findByText('Kapitalerträge (Einkünfte aus Kapitalvermögen)')).toBeTruthy()
    // The default mask has no kap-depot answer yet — the honest "unbekannt" notice, never a guess.
    expect(screen.getByText(/ob dein Depot bei einem deutschen oder ausländischen Broker liegt/)).toBeTruthy()
  })

  it('renders the German-broker notice (Abgeltungsteuer withheld) from the GET response', async () => {
    server.use(http.get(KAPITAL_URL, () => HttpResponse.json(DEUTSCHER_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderKapital()

    expect(await screen.findByText(/Abgeltungsteuer einbehalten/)).toBeTruthy()
  })

  it('shows the derived Posten with its Herkunft once determined', async () => {
    server.use(http.get(KAPITAL_URL, () => HttpResponse.json(DEUTSCHER_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderKapital()

    expect(await screen.findByText('Deine Kapitalerträge')).toBeTruthy()
    expect(screen.getByText('20000 €')).toBeTruthy()
    expect(screen.getByText('Eingabe aus deiner Jahressteuerbescheinigung')).toBeTruthy()
  })

  it('PUTs the captured Kapitalerträge as whole euros', async () => {
    let body: unknown
    let url = ''
    server.use(
      http.put(`${KAPITAL_URL}/kapitalertraege`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json(DEUTSCHER_BROKER, { status: 200 })
      }),
    )
    server.use(http.get(GP_URL, () => HttpResponse.json(null, { status: 200 })))
    renderKapital()
    await screen.findByText('Kapitalerträge (Einkünfte aus Kapitalvermögen)')

    const input = screen.getByLabelText(/Kapitalerträge \(Einkünfte aus Kapitalvermögen\)/)
    fireEvent.change(input, { target: { value: '20000' } })
    // react-native-web fires onSubmitEditing from its keyDown handler on Enter.
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ kind: 'erfasst', wert: 20000 }))
    expect(url).toContain('/kapital/kapitalertraege')
  })

  it('renders the Günstigerprüfung verdict FIRST — eindeutig with the recommendation', async () => {
    server.use(http.get(KAPITAL_URL, () => HttpResponse.json(DEUTSCHER_BROKER, { status: 200 })))
    server.use(http.get(GP_URL, () => HttpResponse.json(EINDEUTIG_ABGELTUNG, { status: 200 })))
    renderKapital()

    expect(await screen.findByTestId('guenstigerpruefung-aussage')).toBeTruthy()
    expect(screen.getByText('Die Abgeltungsteuer ist günstiger.')).toBeTruthy()
    expect(screen.getByText('4750 €')).toBeTruthy()
    expect(screen.getByText('8482 €')).toBeTruthy()
  })

  it('renders the honest no-verdict states and the foreign-broker KAP-Pflicht notice', async () => {
    server.use(
      http.get(KAPITAL_URL, () =>
        HttpResponse.json(
          { ...DEUTSCHER_BROKER, depot: { kind: 'auslaendischer-broker' } },
          { status: 200 },
        ),
      ),
    )
    renderKapital()

    // Foreign broker: the KAP-Pflicht notice is shown, the Günstigerprüfung is never requested.
    expect(await screen.findByText(/keine deutsche Steuer abgeführt/)).toBeTruthy()
    expect(screen.queryByTestId('guenstigerpruefung-aussage')).toBeNull()
  })

  it('shows the honest Krypto gate statement', async () => {
    server.use(
      http.get(KAPITAL_URL, () =>
        HttpResponse.json(
          { ...DEUTSCHER_BROKER, depot: { kind: 'krypto' }, stand: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, offenePosten: 0, konflikte: 0, gegated: ['Kapital'] } },
          { status: 200 },
        ),
      ),
    )
    renderKapital()

    expect(await screen.findByText(/Krypto bleibt in 1.0 ehrlich außen vor/)).toBeTruthy()
  })
})
