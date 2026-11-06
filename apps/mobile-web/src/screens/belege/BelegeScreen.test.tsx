// BelegeScreen (Ticket 10, Phase 2 Slice 1) — the Beleg-Posteingang (ADR-007/008) against the
// real generated `useReceiptControllerList`/`useReceiptControllerSetAssignment` hooks
// (@steuereule/api-client) and the real `GET /v1/belege` + `POST /v1/belege/:id/zuordnung`
// wire, MSW-mocked to the contract. Proves: honest loading/empty/error states, the derived
// Zuordnung states render (ungebunden/vorgeschlagen/zugeordnet/konflikt) with art + dates, the
// suggestion is confirmed by a tap, a conflicting year is VISIBLE (ADR-008) instead of silently
// overwritten, and the upload affordance is the honest "Scan folgt" placeholder (ADR-032 §2).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { ReceiptsScreen } from './BelegeScreen'
import { server } from '../../test-msw-server'
import type { ReceiptResponseDto } from '@steuereule/api-client'

const RECEIPTS_URL = '*/v1/belege'

const UNBOUND: ReceiptResponseDto = {
  id: 'b-ungebunden',
  fileName: 'miete-januar.pdf',
  kind: null,
  belegdatum: null,
  zahlungsdatum: null,
  assignment: { kind: 'ungebunden' },
}

const PROPOSED: ReceiptResponseDto = {
  id: 'b-vorschlag',
  fileName: 'rechnung-fortbildung.pdf',
  kind: 'Sonstiges',
  belegdatum: '2025-12-20',
  zahlungsdatum: '2026-01-15',
  assignment: { kind: 'vorgeschlagen', taxYear: 2026, provenance: 'zahlungsdatum' },
}

const ASSIGNED: ReceiptResponseDto = {
  id: 'b-zugeordnet',
  fileName: 'lohnausweis-2026.pdf',
  kind: 'Lohnausweis',
  belegdatum: '2026-02-01',
  zahlungsdatum: null,
  assignment: { kind: 'zugeordnet', taxYear: 2026 },
}

const CONFLICT: ReceiptResponseDto = {
  id: 'b-konflikt',
  fileName: 'spende-drk.pdf',
  kind: 'Sonstiges',
  belegdatum: '2026-01-02',
  zahlungsdatum: null,
  assignment: { kind: 'konflikt', taxYear: 2025, proposalYear: 2026, provenance: 'belegdatum' },
}

function mockReceipts(data: ReceiptResponseDto[], status = 200) {
  server.use(http.get(RECEIPTS_URL, () => HttpResponse.json(data, { status })))
}

function mockReceiptsError() {
  server.use(http.get(RECEIPTS_URL, () => HttpResponse.error()))
}

function renderReceipts(opts: { lng?: 'de' | 'en' } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <ReceiptsScreen />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('BelegeScreen', () => {
  it('shows a real loading state while the inbox is fetched', async () => {
    mockReceipts([])
    renderReceipts()
    expect(screen.getByLabelText('Deine Belege werden geladen …')).toBeTruthy()
    await screen.findByText('Noch keine Belege.')
    expect(screen.queryByLabelText('Deine Belege werden geladen …')).toBeNull()
  })

  it('renders an honest empty state when the inbox is empty', async () => {
    mockReceipts([])
    renderReceipts()
    await screen.findByText('Noch keine Belege.')
    expect(
      screen.getByText('Wirf Belege übers ganze Jahr rein — hier landen sie und warten auf das richtige Steuerjahr.'),
    ).toBeTruthy()
  })

  it('renders the honest "Scan folgt" placeholder instead of a fake scan/upload button (ADR-032 §2)', async () => {
    mockReceipts([])
    renderReceipts()
    await screen.findByText('Wirf alles rein — wir sortieren')
    expect(screen.getByText(/Das Scannen und Fotografieren der Belege folgt noch/)).toBeTruthy()
    expect(screen.queryByText('Beleg scannen')).toBeNull()
    expect(screen.queryByText('PDF hochladen')).toBeNull()
  })

  it('renders every Zuordnung state with its art and dates, from the API (never hard-coded)', async () => {
    mockReceipts([UNBOUND, PROPOSED, ASSIGNED, CONFLICT])
    renderReceipts()

    // ungebunden
    expect(await screen.findByText('miete-januar.pdf')).toBeTruthy()
    expect(screen.getByText('Unzugeordnet')).toBeTruthy()
    // vorgeschlagen: the suggestion + its origin chip, not a bare verdict
    expect(screen.getByText('rechnung-fortbildung.pdf')).toBeTruthy()
    expect(screen.getByText('Vorschlag: 2026')).toBeTruthy()
    // zugeordnet
    expect(screen.getByText('lohnausweis-2026.pdf')).toBeTruthy()
    expect(screen.getByText('Zugeordnet: 2026')).toBeTruthy()
    // konflikt: both years visible, amber, never a silent overwrite (ADR-008)
    expect(screen.getByText('spende-drk.pdf')).toBeTruthy()
    expect(screen.getByText('Zwei Jahre für diesen Beleg — du entscheidest.')).toBeTruthy()
    expect(screen.getByText(/Zugeordnet: 2025 · Vorschlag: 2026/)).toBeTruthy()
  })

  it('renders the art discriminator: CH types map to labels, null is the generic receipt', async () => {
    mockReceipts([PROPOSED, ASSIGNED, UNBOUND])
    renderReceipts()
    await screen.findByText('rechnung-fortbildung.pdf')
    // `art: 'Lohnausweis'` → label; `art: null` → the generic "Beleg"
    expect(screen.getByText('Lohnausweis')).toBeTruthy()
    expect(screen.getByText('Sonstiges')).toBeTruthy()
    expect(screen.getByText('Beleg')).toBeTruthy()
  })

  it('counts "offen" (everything not zugeordnet) in the appbar pill', async () => {
    mockReceipts([UNBOUND, PROPOSED, ASSIGNED, CONFLICT])
    renderReceipts()
    await screen.findByText('rechnung-fortbildung.pdf')
    expect(screen.getByText('3 offen')).toBeTruthy()
  })

  it('confirms the suggestion with one tap: POST /v1/belege/:id/zuordnung with the suggested year, then shows the confirmed state', async () => {
    // Stateful GET+POST: the API's real behaviour — after a successful write, a re-read of the
    // inbox returns the updated Beleg, so a static `mockBelege([VORGESCHLAGEN])` would re-render
    // the old state and fail this assertion on the refetch.
    let list: ReceiptResponseDto[] = [PROPOSED]
    let posted: { id: string; body: unknown } | null = null
    server.use(
      http.get(RECEIPTS_URL, () => HttpResponse.json(list, { status: 200 })),
      http.post('*/v1/belege/:id/zuordnung', async ({ params, request }) => {
        posted = { id: String(params.id), body: await request.json() }
        list = [{ ...PROPOSED, assignment: { kind: 'zugeordnet', taxYear: 2026 } }]
        return HttpResponse.json(list[0], { status: 200 })
      }),
    )
    renderReceipts()

    await screen.findByText('Vorschlag: 2026')
    fireEvent.click(screen.getByText('Zuordnen zu 2026'))

    await screen.findByText('Zugeordnet: 2026')
    expect(posted).toEqual({ id: 'b-vorschlag', body: { taxYear: 2026, proposalDismissed: false } })
  })

  it('shows a CONFLICT (both years) when a different year is assigned, never a silent overwrite (ADR-008)', async () => {
    let list: ReceiptResponseDto[] = [PROPOSED]
    let posted: unknown = null
    server.use(
      http.get(RECEIPTS_URL, () => HttpResponse.json(list, { status: 200 })),
      http.post('*/v1/belege/:id/zuordnung', async ({ request }) => {
        posted = await request.json()
        // The API's real derived state: confirmed 2025 contradicts the date-derived 2026.
        list = [
          { ...PROPOSED, assignment: { kind: 'konflikt', taxYear: 2025, proposalYear: 2026, provenance: 'zahlungsdatum' } },
        ]
        return HttpResponse.json(list[0], { status: 200 })
      }),
    )
    renderReceipts()

    await screen.findByText('Vorschlag: 2026')
    fireEvent.click(screen.getByText('Anderes Jahr'))
    fireEvent.change(screen.getByLabelText('Steuerjahr'), { target: { value: '2025' } })
    fireEvent.click(screen.getByText('Diesem Jahr zuordnen'))

    await screen.findByText('Zwei Jahre für diesen Beleg — du entscheidest.')
    expect(screen.getByText(/Zugeordnet: 2025 · Vorschlag: 2026/)).toBeTruthy()
    expect(posted).toEqual({ taxYear: 2025, proposalDismissed: false })
  })

  it('rejects a non-four-digit year in the manual override instead of POSTing it', async () => {
    mockReceipts([PROPOSED])
    let postCalls = 0
    server.use(
      http.post('*/v1/belege/:id/zuordnung', () => {
        postCalls += 1
        return HttpResponse.json(ASSIGNED, { status: 200 })
      }),
    )
    renderReceipts()

    await screen.findByText('Vorschlag: 2026')
    fireEvent.click(screen.getByText('Anderes Jahr'))
    fireEvent.change(screen.getByLabelText('Steuerjahr'), { target: { value: '2abc' } })
    expect(screen.getByText('Bitte ein Jahr mit vier Ziffern eingeben.')).toBeTruthy()
    // The confirm button is disabled; clicking it must not send a request.
    fireEvent.click(screen.getByText('Diesem Jahr zuordnen'))
    expect(postCalls).toBe(0)
  })

  it('resolves a conflict by adopting the suggestion (one explicit choice)', async () => {
    let list: ReceiptResponseDto[] = [CONFLICT]
    let posted: unknown = null
    server.use(
      http.get(RECEIPTS_URL, () => HttpResponse.json(list, { status: 200 })),
      http.post('*/v1/belege/:id/zuordnung', async ({ request }) => {
        posted = await request.json()
        list = [{ ...CONFLICT, assignment: { kind: 'zugeordnet', taxYear: 2026 } }]
        return HttpResponse.json(list[0], { status: 200 })
      }),
    )
    renderReceipts()

    await screen.findByText('Zwei Jahre für diesen Beleg — du entscheidest.')
    fireEvent.click(screen.getByText('Vorschlag 2026 übernehmen'))
    await screen.findByText('Zugeordnet: 2026')
    expect(posted).toEqual({ taxYear: 2026, proposalDismissed: false })
  })

  it('resolves a conflict by keeping the user’s own year (ADR-008 "bei meinem Jahr bleiben" — no dead end)', async () => {
    let list: ReceiptResponseDto[] = [CONFLICT]
    let posted: unknown = null
    server.use(
      http.get(RECEIPTS_URL, () => HttpResponse.json(list, { status: 200 })),
      http.post('*/v1/belege/:id/zuordnung', async ({ request }) => {
        posted = await request.json()
        // The API's real derived state: dismissing the suggestion resolves to zugeordnet on the
        // user's own confirmed year (2025), the contradicting suggestion no longer a conflict.
        list = [{ ...CONFLICT, assignment: { kind: 'zugeordnet', taxYear: 2025 } }]
        return HttpResponse.json(list[0], { status: 200 })
      }),
    )
    renderReceipts()

    await screen.findByText('Zwei Jahre für diesen Beleg — du entscheidest.')
    fireEvent.click(screen.getByText('Bei 2025 bleiben'))
    await screen.findByText('Zugeordnet: 2025')
    expect(posted).toEqual({ taxYear: 2025, proposalDismissed: true })
  })

  it('shows a retryable error state on a genuine network failure, and recovers on retry', async () => {
    mockReceiptsError()
    renderReceipts()

    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Deine Belege konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()

    mockReceipts([ASSIGNED])
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Zugeordnet: 2026')
  })

  it('treats a non-200 response as an honest error, not a silent empty fallthrough', async () => {
    server.use(http.get(RECEIPTS_URL, () => HttpResponse.json([], { status: 500 })))
    renderReceipts()
    await screen.findByText('Das hat nicht geklappt.')
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    mockReceipts([PROPOSED, CONFLICT])
    renderReceipts({ lng: 'en' })
    expect(await screen.findByText('Receipts')).toBeTruthy()
    expect(screen.getByText('Suggestion: 2026')).toBeTruthy()
    expect(screen.getByText('Two years for this receipt — you decide.')).toBeTruthy()
    expect(screen.getByText('Adopt suggestion 2026')).toBeTruthy()
    expect(screen.getByText('Keep 2025')).toBeTruthy()
  })

  it('refetches the inbox after a successful assignment so the derived state never goes stale', async () => {
    let getCalls = 0
    server.use(
      http.get(RECEIPTS_URL, () => {
        getCalls += 1
        return HttpResponse.json(getCalls === 1 ? [PROPOSED] : [ASSIGNED], { status: 200 })
      }),
      http.post('*/v1/belege/:id/zuordnung', () => HttpResponse.json(ASSIGNED, { status: 200 })),
    )
    renderReceipts()

    await screen.findByText('Vorschlag: 2026')
    fireEvent.click(screen.getByText('Zuordnen zu 2026'))
    await waitFor(() => expect(screen.getByText('Zugeordnet: 2026')).toBeTruthy())
    expect(getCalls).toBe(2)
  })
})
