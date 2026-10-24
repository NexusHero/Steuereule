// LStB-Masken-Screen (REQ-016) — renders the three fields from GET, sends whole-euro values via
// PUT, and shows a named widerspruch (ADR-008), never a silent fix. Honest loading/error states.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { LstbScreen } from './LstbScreen'
import { server } from '../../test-msw-server'
import type { LstbResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const LSTB_URL = `*/v1/steuerjahre/${TAX_YEAR}/lstb`

const WIDERSPRUCH: LstbResponseDto = {
  bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
  lohnsteuer: { kind: 'erfasst', wert: 60000 },
  sozialversicherung: { kind: 'erfasst', wert: 0 },
  zustand: {
    kind: 'widerspruch',
    widersprueche: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 60000, bruttoarbeitslohn: 50000 }],
  },
}

function renderLstb() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <LstbScreen taxYear={TAX_YEAR} onDone={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('LstbScreen', () => {
  it('renders the three LStB fields from the GET response', async () => {
    renderLstb()

    expect(await screen.findByText('Bruttoarbeitslohn (Zeile 3)')).toBeTruthy()
    expect(screen.getByText('Einbehaltene Lohnsteuer (Zeile 4)')).toBeTruthy()
    expect(screen.getByText('SV-Arbeitnehmeranteil (Zeilen 22/23)')).toBeTruthy()
  })

  it('shows a named widerspruch when one figure exceeds the Bruttoarbeitslohn (ADR-008)', async () => {
    server.use(http.get(LSTB_URL, () => HttpResponse.json(WIDERSPRUCH, { status: 200 })))
    renderLstb()

    expect(await screen.findByText('Das passt nicht zusammen:')).toBeTruthy()
    expect(screen.getByText('Die Lohnsteuer ist höher als der Bruttoarbeitslohn.')).toBeTruthy()
  })

  it('PUTs the honest "unklar" state when the unreadable fallback is tapped', async () => {
    let body: unknown
    let url = ''
    server.use(
      http.put(`${LSTB_URL}/bruttoarbeitslohn`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json({ ...WIDERSPRUCH, zustand: { kind: 'unvollstaendig', offen: ['lohnsteuer', 'sozialversicherung'], unklar: ['bruttoarbeitslohn'] } }, { status: 200 })
      }),
    )
    renderLstb()
    await screen.findByText('Bruttoarbeitslohn (Zeile 3)')

    const unklarButtons = screen.getAllByText('unlesbar')
    fireEvent.click(unklarButtons[0]!)

    await waitFor(() => expect(body).toEqual({ kind: 'unklar' }))
    expect(url).toContain('/lstb/bruttoarbeitslohn')
  })

  it('shows an honest loading state, then the fields', async () => {
    renderLstb()
    expect(await screen.findByText('Bruttoarbeitslohn (Zeile 3)')).toBeTruthy()
  })
})
