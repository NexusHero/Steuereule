// Fristen-Banner (REQ-027, ticket 10.7) — the Warnmodus renders a SOBER banner (Produkt-ADR-023:
// what happened, what to do, no punchline, never blaming the user), NEVER a tax status (ADR-0039:
// the missed frist stays `entwurf` + banner; `stufe: 'keine'` renders nothing). All facts come
// from the server (GET .../fristen) — the client clock plays no role.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { FristenBanner, Banner } from './FristenBanner'
import { server } from '../../test-msw-server'
import type { FristenResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const FRISTEN_URL = `*/v1/steuerjahre/${TAX_YEAR}/fristen`

function renderBanner() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <FristenBanner taxYear={TAX_YEAR} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const WARNUNG: FristenResponseDto = {
  abgabefrist: '2027-07-31',
  heute: '2027-06-01',
  stufe: 'warnung',
  verbleibendeTage: 60,
  verspaetungszuschlag: { mindestsatzEur: 25, prozentProMonat: 0.25 },
}

const ABGELAUFEN: FristenResponseDto = {
  abgabefrist: '2027-07-31',
  heute: '2027-08-01',
  stufe: 'abgelaufen',
  verbleibendeTage: -1,
  verspaetungszuschlag: { mindestsatzEur: 25, prozentProMonat: 0.25 },
}

describe('FristenBanner', () => {
  it('renders nothing at stufe keine — the honest absence, not a permanent banner', async () => {
    server.use(
      http.get(FRISTEN_URL, () =>
        HttpResponse.json({ ...WARNUNG, stufe: 'keine', verbleibendeTage: 279, heute: '2026-10-25' }, { status: 200 }),
      ),
    )
    const { container } = renderBanner()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('[data-testid^="fristen-banner"]')).toBeNull()
  })

  it('warns soberly with the frist and the § 152 AO minimum from 60 days out', async () => {
    server.use(http.get(FRISTEN_URL, () => HttpResponse.json(WARNUNG, { status: 200 })))
    renderBanner()

    const banner = await screen.findByTestId('fristen-banner-warnung')
    expect(banner).toBeTruthy()
    expect(screen.getByText(/Abgabefrist: 31\.07\.2027 \(noch 60 Tage\)/)).toBeTruthy()
    expect(screen.getByText(/mindestens 25 € pro Monat/)).toBeTruthy()
  })

  it('names the missed frist soberly — a banner, never a verspätet status (ADR-0039)', async () => {
    server.use(http.get(FRISTEN_URL, () => HttpResponse.json(ABGELAUFEN, { status: 200 })))
    renderBanner()

    const banner = await screen.findByTestId('fristen-banner-abgelaufen')
    expect(banner).toBeTruthy()
    expect(screen.getByText(/um 1 Tage überschritten/)).toBeTruthy()
  })
})

describe('Banner (pure presentational)', () => {
  it('renders the warnung copy for a fixed DTO', () => {
    const i18n = createAppI18n('de')
    render(
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <Banner dto={WARNUNG} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(screen.getByTestId('fristen-banner-warnung')).toBeTruthy()
  })
})
