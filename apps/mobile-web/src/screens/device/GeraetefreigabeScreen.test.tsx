import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { GeraetefreigabeScreen } from './GeraetefreigabeScreen'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

function renderApproval(opts: { lng?: 'de' | 'en'; userCode?: string } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <GeraetefreigabeScreen userCode={opts.userCode ?? 'K7QX-9F2M'} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function mockPending(overrides: Partial<{ userCode: string; status: string; userAgent: string | null; region: string | null; requestedAt: string | null }> = {}) {
  const body = {
    userCode: 'K7QX-9F2M',
    status: 'pending',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    region: 'DE',
    requestedAt: '2026-08-01T14:32:00.000Z',
    ...overrides,
  }
  server.use(http.get(`${BASE_URL}/v1/device/pending`, () => HttpResponse.json(body, { status: 200 })))
  return body
}

describe('GeraetefreigabeScreen (#238)', () => {
  it('shows an honest loading state before the pending request resolves', () => {
    server.use(http.get(`${BASE_URL}/v1/device/pending`, () => new Promise(() => {})))
    renderApproval()
    expect(screen.getByLabelText('Wir laden die Anfrage …')).toBeTruthy()
  })

  it('renders the real user_code, large, once loaded', async () => {
    mockPending({ userCode: 'ZQ8P-4N21' })
    renderApproval({ userCode: 'ZQ8P-4N21' })
    expect(await screen.findByText('ZQ8P-4N21')).toBeTruthy()
  })

  it('asks whether the code is on the other screen — never "Freigeben?"', async () => {
    mockPending()
    renderApproval()
    await screen.findByText('K7QX-9F2M')
    expect(screen.getByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeTruthy()
    expect(screen.queryByText('Freigeben?')).toBeNull()
    expect(screen.queryByText(/^Freigeben$/)).toBeNull()
  })

  // The explicit, persistent warning Decision 4 requires — an assertion against this exact
  // copy, not a snapshot, so removing it fails this test by name rather than a generic diff.
  it('shows the "never approved from a forwarded code" warning, as an alert', async () => {
    mockPending()
    renderApproval()
    await screen.findByText('K7QX-9F2M')
    const warning = screen.getByText(
      'Ein Code, den du per Nachricht oder Link bekommen hast, wird hier niemals bestätigt — nur ein Code, der gerade auf einem anderen Bildschirm steht.',
    )
    expect(warning).toBeTruthy()
    // The warning box itself carries the alert role — not the button below or any other
    // element on the screen — proving it's the same accessibilityRole="alert" pattern
    // LoginScreen.tsx's verifyBanner already establishes, not a plain, unannounced <Text>.
    const alertRegion = screen.getByRole('alert')
    expect(alertRegion.textContent).toMatch(/niemals bestätigt/)
  })

  it('offers exactly one button — no session-scope choice (Decision 5 stays revoked)', async () => {
    mockPending()
    renderApproval()
    await screen.findByText('K7QX-9F2M')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('Ja, das ist mein Code')).toBeTruthy()
  })

  // AC-3 — real request data, not a static screen. Proven against two different simulated
  // requests: a hard-coded/stale value, or one that only shows *some* browser/OS/time text,
  // would pass a single-request test just as well as this one.
  it('renders two different requests\' browser/OS/time distinctly — not a static screen (AC-3)', async () => {
    mockPending({
      userCode: 'AAAA-1111',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      requestedAt: '2026-08-01T14:32:00.000Z',
    })
    const first = renderApproval({ userCode: 'AAAA-1111' })
    await screen.findByText('AAAA-1111')
    expect(screen.getByText('Chrome')).toBeTruthy()
    expect(screen.getByText('Windows')).toBeTruthy()
    first.unmount()

    mockPending({
      userCode: 'BBBB-2222',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      requestedAt: '2020-01-01T00:00:00.000Z',
    })
    renderApproval({ userCode: 'BBBB-2222' })
    await screen.findByText('BBBB-2222')
    expect(screen.getByText('Safari')).toBeTruthy()
    expect(screen.getByText('macOS')).toBeTruthy()
    expect(screen.queryByText('Chrome')).toBeNull()
    expect(screen.queryByText('Windows')).toBeNull()
  })

  // Region — this screen's own independent assertion (not a stand-in for the device list's).
  // A resolvable code renders the country; an unresolvable one renders "Region unbekannt" —
  // never a guess. Two separate tests, matching the ticket's "two rendering paths, two tests".
  describe('region (AC-3 — independent of the device list\'s own AC-5 assertion)', () => {
    it('renders the resolved country for a real region code', async () => {
      mockPending({ region: 'DE' })
      renderApproval()
      await screen.findByText('K7QX-9F2M')
      expect(screen.getByText('Deutschland')).toBeTruthy()
      expect(screen.queryByText('Region unbekannt')).toBeNull()
    })

    it('renders "Region unbekannt" for the unresolved sentinel — never a guessed country', async () => {
      mockPending({ region: 'unknown' })
      renderApproval()
      await screen.findByText('K7QX-9F2M')
      expect(screen.getByText('Region unbekannt')).toBeTruthy()
    })
  })

  it('renders an honest fallback for a missing User-Agent/timestamp, never a blank row', async () => {
    mockPending({ userAgent: null, requestedAt: null })
    renderApproval()
    await screen.findByText('K7QX-9F2M')
    expect(screen.getByText('Unbekannter Browser')).toBeTruthy()
    expect(screen.getByText('Unbekanntes Betriebssystem')).toBeTruthy()
    expect(screen.getByText('Zeitpunkt unbekannt')).toBeTruthy()
  })

  it('shows an honest error state for an expired/invalid code (400), not a crash or blank screen', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/device/pending`, () => HttpResponse.json({ error: 'invalid_request', error_description: 'Invalid user code' }, { status: 400 })),
    )
    renderApproval()
    expect(await screen.findByText('Code ungültig oder abgelaufen')).toBeTruthy()
    expect(screen.queryByText('Ja, das ist mein Code')).toBeNull()
  })

  it('shows the same honest error state when the pending request is rate-limited (429)', async () => {
    server.use(http.get(`${BASE_URL}/v1/device/pending`, () => HttpResponse.json({}, { status: 429 })))
    renderApproval()
    expect(await screen.findByText('Code ungültig oder abgelaufen')).toBeTruthy()
  })

  it('shows the approved confirmation directly when the request was already approved elsewhere', async () => {
    mockPending({ status: 'approved' })
    renderApproval()
    expect(await screen.findByText('Erledigt')).toBeTruthy()
    expect(screen.queryByText('Ja, das ist mein Code')).toBeNull()
  })

  it('shows the honest error state for a denied request, not the approval UI', async () => {
    mockPending({ status: 'denied' })
    renderApproval()
    expect(await screen.findByText('Code ungültig oder abgelaufen')).toBeTruthy()
    expect(screen.queryByText('Ja, das ist mein Code')).toBeNull()
  })

  it('confirms — POSTs the real userCode to /v1/device/approve and shows the honest confirmation', async () => {
    mockPending({ userCode: 'K7QX-9F2M' })
    let receivedBody: unknown
    server.use(
      http.post(`${BASE_URL}/v1/device/approve`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ success: true }, { status: 200 })
      }),
    )
    renderApproval()
    await screen.findByText('K7QX-9F2M')

    fireEvent.click(screen.getByText('Ja, das ist mein Code'))

    await waitFor(() => expect(receivedBody).toEqual({ userCode: 'K7QX-9F2M' }))
    expect(await screen.findByText('Erledigt')).toBeTruthy()
    expect(screen.getByText('Der andere Bildschirm meldet sich jetzt an.')).toBeTruthy()
  })

  it('shows an honest, retryable error if approving fails — never a silent hang', async () => {
    mockPending()
    server.use(http.post(`${BASE_URL}/v1/device/approve`, () => HttpResponse.json({}, { status: 403 })))
    renderApproval()
    await screen.findByText('K7QX-9F2M')

    fireEvent.click(screen.getByText('Ja, das ist mein Code'))

    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch einmal.')).toBeTruthy()
    // Still on the approval screen, not stuck — the button is available to try again.
    expect(screen.getByText('Ja, das ist mein Code')).toBeTruthy()
  })

  it('switches to English (ADR-0006)', async () => {
    mockPending()
    renderApproval({ lng: 'en' })
    await screen.findByText('K7QX-9F2M')
    expect(screen.getByText('Is this code currently on your screen?')).toBeTruthy()
    expect(screen.getByText('Yes, this is my code')).toBeTruthy()
  })
})
