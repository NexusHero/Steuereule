// Plausibilitäts-Screen (M2) — the honest gate: renders Widersprüche/Hinweise/einreichbar from the
// core's `pruefePlausibilitaet`, reading the LStB + interview facts. No fake Ampel (ADR-0032).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { PlausibilitaetScreen } from './PlausibilitaetScreen'
import { server } from '../../test-msw-server'

const TAX_YEAR = 2026

function renderPlausibilitaet() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <PlausibilitaetScreen taxYear={TAX_YEAR} onBack={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('PlausibilitaetScreen', () => {
  it('reports "nicht einreichbar" with the honest LStB blocker on an empty mask', async () => {
    renderPlausibilitaet()

    expect(await screen.findByText('Da ist noch etwas offen:')).toBeTruthy()
    expect(screen.getByText('Lohnsteuerbescheinigung noch nicht vollständig.')).toBeTruthy()
  })

  it('reports "einreichbar" once the LStB is complete and nothing is gated', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/lstb`, () =>
        HttpResponse.json(
          {
            bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
            lohnsteuer: { kind: 'erfasst', wert: 8000 },
            sozialversicherung: { kind: 'erfasst', wert: 9000 },
            zustand: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
          },
          { status: 200 },
        ),
      ),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { job: 'Angestellt' }, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 }),
      ),
    )
    renderPlausibilitaet()

    expect(await screen.findByText('Alles klar — du kannst abgeben.')).toBeTruthy()
  })

  it('names a gated Einkunftsart as a blocker (ADR-032)', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
        HttpResponse.json({ answers: { job: 'Selbstständig' }, nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 }, { status: 200 }),
      ),
    )
    renderPlausibilitaet()

    expect(await screen.findByText('Eine Einkunftsart können wir noch nicht rechnen.')).toBeTruthy()
  })
})
