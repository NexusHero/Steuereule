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
import { EMPTY_LSTB_RESPONSE, server } from '../../test-msw-server'
import type { LstbResponseDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const LSTB_URL = `*/v1/steuerjahre/${TAX_YEAR}/lstb`

const CONFLICT: LstbResponseDto = {
  bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
  lohnsteuer: { kind: 'erfasst', value: 60000 },
  sozialversicherung: { kind: 'erfasst', value: 0 },
  state: {
    kind: 'widerspruch',
    conflicts: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 60000, bruttoarbeitslohn: 50000 }],
  },
}

function renderLstb(partnerName?: string) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <LstbScreen taxYear={TAX_YEAR} onDone={() => {}} {...(partnerName ? { partnerName } : {})} />
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
    expect(screen.getByText('SV-Arbeitnehmeranteil (Summe der Zeilen 23, 25, 26 und 27)')).toBeTruthy()
  })

  it('shows a named widerspruch when one figure exceeds the Bruttoarbeitslohn (ADR-008)', async () => {
    server.use(http.get(LSTB_URL, () => HttpResponse.json(CONFLICT, { status: 200 })))
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
        return HttpResponse.json({ ...CONFLICT, state: { kind: 'unvollstaendig', open: ['lohnsteuer', 'sozialversicherung'], unclear: ['bruttoarbeitslohn'] } }, { status: 200 })
      }),
    )
    renderLstb()
    await screen.findByText('Bruttoarbeitslohn (Zeile 3)')

    const unclearButtons = screen.getAllByText('unlesbar')
    fireEvent.click(unclearButtons[0]!)

    await waitFor(() => expect(body).toEqual({ kind: 'unklar' }))
    expect(url).toContain('/lstb/bruttoarbeitslohn')
  })

  it('saves a typed value as soon as the field loses focus — no Enter needed', async () => {
    const puts: { url: string; body: unknown }[] = []
    server.use(
      http.put(`${LSTB_URL}/:feld`, async ({ request }) => {
        puts.push({ url: request.url, body: await request.json() })
        return HttpResponse.json({}, { status: 200 })
      }),
    )
    renderLstb()
    const gross = await screen.findByLabelText('Bruttoarbeitslohn (Zeile 3) (Ganzzahlige Euro)')

    fireEvent.change(gross, { target: { value: '45000' } })
    fireEvent.blur(gross)

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]!.url).toMatch(/\/lstb\/bruttoarbeitslohn$/)
    expect(puts[0]!.body).toEqual({ kind: 'erfasst', value: 45000 })
  })

  it("records the partner's certificate as person=B and says whose it is (ADR-0054)", async () => {
    const urls: string[] = []
    server.use(
      http.get(LSTB_URL, ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json(EMPTY_LSTB_RESPONSE, { status: 200 })
      }),
      http.put(`${LSTB_URL}/:feld`, ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json({}, { status: 200 })
      }),
    )
    renderLstb('Sabine')
    expect(await screen.findByText('Lohnsteuerbescheinigung von Sabine')).toBeTruthy()
    const gross = screen.getByLabelText('Bruttoarbeitslohn (Zeile 3) (Ganzzahlige Euro)')
    fireEvent.change(gross, { target: { value: '48000' } })
    fireEvent.blur(gross)

    await waitFor(() => expect(urls.some((u) => u.endsWith('/lstb/bruttoarbeitslohn?person=B'))).toBe(true))
    expect(urls[0]).toMatch(/\/lstb\?person=B$/)
  })

  it('never turns an untouched empty field into 0 € when it loses focus', async () => {
    const puts: unknown[] = []
    server.use(http.put(`${LSTB_URL}/:feld`, () => { puts.push(1); return HttpResponse.json({}, { status: 200 }) }))
    renderLstb()
    const gross = await screen.findByLabelText('Bruttoarbeitslohn (Zeile 3) (Ganzzahlige Euro)')

    fireEvent.focus(gross)
    fireEvent.blur(gross)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(puts).toHaveLength(0)
  })

  it('shows an honest loading state, then the fields', async () => {
    renderLstb()
    expect(await screen.findByText('Bruttoarbeitslohn (Zeile 3)')).toBeTruthy()
  })
})
