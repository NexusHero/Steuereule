// BescheidScreen (REQ-023, ticket 10.3) — the Bescheidprüfung against the real generated
// `useBescheidController*` hooks (@steuereule/api-client) and the real
// `GET/PUT /v1/steuerjahre/{jahr}/bescheid/*` wire, MSW-mocked to the contract. Proves: honest
// loading/empty/error states, the transcribed figures render, the Abgleich diff is VISIBLE (never
// silent, ADR-008/032), the § 355 AO Fristen-Countdown runs from the Bescheiddatum, the Einspruch
// flow (Grund-Auswahl) appears only when the server allows it, and there is NO „Korrigieren"
// button after the Bescheid (ADR-009/ADR-032).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { BescheidScreen } from './BescheidScreen'
import { server } from '../../test-msw-server'
import type { BescheidResponseDto } from '@steuereule/api-client'

const BESCHEID_URL = '*/v1/steuerjahre/2026/bescheid'

function leererBescheid(): BescheidResponseDto {
  return {
    status: 'eingegangen',
    bescheiddatum: null,
    einspruchGrund: null,
    felder: [
      { id: 'einnahmen', kind: 'offen' },
      { id: 'vorsorgeaufwand', kind: 'offen' },
      { id: 'anrechnung', kind: 'offen' },
      { id: 'festgesetzteSteuer', kind: 'offen' },
      { id: 'erstattung', kind: 'offen' },
    ],
    abgleich: { abweichungen: [], berechnungUnvollstaendig: false },
    frist: { bescheiddatum: null, fristEnde: null, verbleibendeTage: null },
    naechsteZustaende: ['geprüft'],
  }
}

function mockBescheid(data: BescheidResponseDto, status = 200) {
  server.use(http.get(BESCHEID_URL, () => HttpResponse.json(data, { status })))
}

function renderBescheid() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <BescheidScreen />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('BescheidScreen', () => {
  it('shows a real loading state while the Bescheid is fetched', async () => {
    mockBescheid(leererBescheid())
    renderBescheid()
    expect(screen.getByLabelText('Dein Bescheid wird geladen …')).toBeTruthy()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.queryByLabelText('Dein Bescheid wird geladen …')).toBeNull()
  })

  it('renders the five figures and the honest "noch kein Bescheiddatum" state', async () => {
    mockBescheid(leererBescheid())
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.getByText('Einkünfte laut Bescheid')).toBeTruthy()
    expect(screen.getByText('Vorsorgeaufwendungen laut Bescheid')).toBeTruthy()
    expect(screen.getByText('Anrechenbare Steuern laut Bescheid')).toBeTruthy()
    expect(screen.getByText('Festgesetzte Einkommensteuer')).toBeTruthy()
    expect(screen.getByText('Erstattung / Nachzahlung')).toBeTruthy()
    expect(screen.getByText('Trag das Bescheiddatum ein, damit wir deine Einspruchsfrist zählen.')).toBeTruthy()
  })

  it('renders a deviation as a visible diff, never silent (ADR-008/032)', async () => {
    const data = leererBescheid()
    data.felder[0] = { id: 'einnahmen', kind: 'erfasst', wert: 48_000 }
    data.abgleich = {
      abweichungen: [{ feld: 'einnahmen', bescheid: 48_000, berechnet: 50_000, differenz: -2_000 }],
      berechnungUnvollstaendig: false,
    }
    mockBescheid(data)
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.getByText('Abgleich mit deiner Berechnung')).toBeTruthy()
    expect(screen.getByText('Bescheid: 48.000 € · berechnet: 50.000 €')).toBeTruthy()
  })

  it('renders "alles stimmt überein" when there are no deviations', async () => {
    mockBescheid(leererBescheid())
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.getByText('Alles stimmt überein ✓')).toBeTruthy()
  })

  it('shows the § 355 AO Fristen-Countdown from the Bescheiddatum', async () => {
    const data = leererBescheid()
    data.frist = { bescheiddatum: '2026-03-15', fristEnde: '2026-04-15', verbleibendeTage: 31 }
    mockBescheid(data)
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.getByText('Einspruchsfrist')).toBeTruthy()
    expect(screen.getByText(/Noch 31 Tage — bis 2026-04-15/)).toBeTruthy()
  })

  it('offers the Einspruch flow (Grund-Auswahl) only when the server allows geprüft → einspruch-eingelegt', async () => {
    const data = leererBescheid()
    data.status = 'geprüft'
    data.naechsteZustaende = ['einspruch-eingelegt']
    mockBescheid(data)
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.getByText('Einspruch')).toBeTruthy()
    expect(screen.getByText('Ein Betrag ist falsch')).toBeTruthy()
    expect(screen.getByText('Ein Beleg wurde nicht berücksichtigt')).toBeTruthy()
    expect(screen.getByText('Sonstiges')).toBeTruthy()
  })

  it('never renders a "Korrigieren" button after the Bescheid (ADR-009/ADR-032)', async () => {
    const data = leererBescheid()
    data.status = 'geprüft'
    data.naechsteZustaende = ['einspruch-eingelegt']
    mockBescheid(data)
    renderBescheid()
    await screen.findByText('Dein Steuerbescheid')
    expect(screen.queryByText('Korrigieren')).toBeNull()
    expect(screen.queryByText(/Korrigieren/)).toBeNull()
  })

  it('files an Einspruch with a chosen Grund, then refetches to the filed state', async () => {
    let state: BescheidResponseDto = { ...leererBescheid(), status: 'geprüft', naechsteZustaende: ['einspruch-eingelegt'] }
    let posted: unknown = null
    server.use(
      http.get(BESCHEID_URL, () => HttpResponse.json(state, { status: 200 })),
      http.put('*/v1/steuerjahre/2026/bescheid/einspruch', async ({ request }) => {
        posted = await request.json()
        state = { ...state, status: 'einspruch-eingelegt', einspruchGrund: 'betrag-falsch', naechsteZustaende: [] }
        return HttpResponse.json(state, { status: 200 })
      }),
    )
    renderBescheid()

    await screen.findByText('Ein Betrag ist falsch')
    fireEvent.click(screen.getByText('Ein Betrag ist falsch'))

    await screen.findByText('Einspruch eingelegt: Ein Betrag ist falsch.')
    expect(posted).toEqual({ grund: 'betrag-falsch' })
  })

  it('shows a retryable error state on a genuine network failure', async () => {
    server.use(http.get(BESCHEID_URL, () => HttpResponse.error()))
    renderBescheid()
    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Dein Bescheid konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
  })

  it('treats a non-200 response as an honest error, not a silent empty fallthrough', async () => {
    server.use(http.get(BESCHEID_URL, () => HttpResponse.json({}, { status: 500 })))
    renderBescheid()
    await screen.findByText('Das hat nicht geklappt.')
  })
})
