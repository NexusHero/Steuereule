// BelegeScreen (Ticket 10, Phase 2 Slice 1) — the Beleg-Posteingang (ADR-007/008) against the
// real generated `useReceiptControllerList`/`useReceiptControllerSetAssignment` hooks
// (@steuereule/api-client) and the real `GET /v1/belege` + `POST /v1/belege/:id/zuordnung`
// wire, MSW-mocked to the contract. Proves: honest loading/empty/error states, the derived
// Zuordnung states render (ungebunden/vorgeschlagen/zugeordnet/konflikt) with art + dates, the
// suggestion is confirmed by a tap, a conflicting year is VISIBLE (ADR-008) instead of silently
// overwritten, and the upload affordance is the honest "Scan folgt" placeholder (ADR-032 §2).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { Text } from 'react-native'
import { createAppI18n } from '../../i18n/app-i18n'
import { ReceiptsScreen } from './ReceiptsScreen'
import { server } from '../../test-msw-server'
import { ShellStateProvider, useShellState } from '../../navigation/ShellState'
import type { AssignmentQuestionDto, ParseReceiptResponseDto, ReceiptResponseDto } from '@steuereule/api-client'
import { receiptInboxHandler, receiptPage } from '../../test-receipt-inbox'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'

// The device reading (PDF text layer / OCR) is the one seam replaced here: everything after it is the real pipeline.
const { mockExtractDocumentText } = vi.hoisted(() => ({ mockExtractDocumentText: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: mockExtractDocumentText }
})

const RECEIPTS_URL = '*/v1/belege'

const UNBOUND: ReceiptResponseDto = {
  id: 'b-ungebunden',
  fileName: 'miete-januar.pdf',
  kind: null,
  belegdatum: null,
  zahlungsdatum: null,
  hasFile: false,
  holders: [],
  holderTaxYear: null,
  processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
  filledFields: [],
  duplicateOf: null,
  mimeType: null,
  byteLength: null,
  assignment: { kind: 'ungebunden' },
}

const PROPOSED: ReceiptResponseDto = {
  id: 'b-vorschlag',
  fileName: 'rechnung-fortbildung.pdf',
  kind: 'Sonstiges',
  belegdatum: '2025-12-20',
  zahlungsdatum: '2026-01-15',
  hasFile: false,
  holders: [],
  holderTaxYear: null,
  processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
  filledFields: [],
  duplicateOf: null,
  mimeType: null,
  byteLength: null,
  assignment: { kind: 'vorgeschlagen', taxYear: 2026, provenance: 'zahlungsdatum' },
}

const ASSIGNED: ReceiptResponseDto = {
  id: 'b-zugeordnet',
  fileName: 'lohnausweis-2026.pdf',
  kind: 'Lohnausweis',
  belegdatum: '2026-02-01',
  zahlungsdatum: null,
  hasFile: true,
  holders: [],
  holderTaxYear: null,
  processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
  filledFields: [],
  duplicateOf: null,
  mimeType: 'application/pdf',
  byteLength: 1024,
  assignment: { kind: 'zugeordnet', taxYear: 2026 },
}

const CONFLICT: ReceiptResponseDto = {
  id: 'b-konflikt',
  fileName: 'spende-drk.pdf',
  kind: 'Sonstiges',
  belegdatum: '2026-01-02',
  zahlungsdatum: null,
  hasFile: false,
  holders: [],
  holderTaxYear: null,
  processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
  filledFields: [],
  duplicateOf: null,
  mimeType: null,
  byteLength: null,
  assignment: { kind: 'konflikt', taxYear: 2025, proposalYear: 2026, provenance: 'belegdatum' },
}

function mockReceipts(data: ReceiptResponseDto[], status = 200) {
  server.use(status === 200 ? receiptInboxHandler(data) : http.get(RECEIPTS_URL, () => HttpResponse.json(data, { status })))
}

function mockReceiptsError() {
  server.use(http.get(RECEIPTS_URL, () => HttpResponse.error()))
}

function YearProbe() {
  return <Text testID="shell-year">{String(useShellState().taxYear)}</Text>
}

function renderReceipts(opts: { lng?: 'de' | 'en'; shell?: boolean } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = (
    <ThemeProvider mode="light">
      <ReceiptsScreen />
    </ThemeProvider>
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {opts.shell ? (
          <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
            <YearProbe />
            {content}
          </ShellStateProvider>
        ) : (
          content
        )}
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const PROCESSING_DONE = { state: 'uebernommen', reason: null, pending: 0, applied: 1, dismissed: 0, draftsTaxYear: 2025, open: false } as const

function parseResponse(overrides: Partial<ParseReceiptResponseDto> = {}): ParseReceiptResponseDto {
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'spende', receiptDate: null, amountEur: 50, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: 'Spende', taxYear: 2025 },
    stagedAction: null,
    assistantMessage: null,
    draftsTaxYear: null,
    filedInTaxYear: null,
    noValuesReason: null,
    duplicateOf: null,
    processing: null,
    ...overrides,
  }
}

describe('BelegeScreen', () => {
  beforeEach(() => {
    // Unless a test says otherwise, the device finds no text and the server records that.
    mockExtractDocumentText.mockReset()
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: '', usedOcrFallback: false, pagesProcessed: 1 })
    server.use(http.post('*/v1/belege/parse', () => HttpResponse.json(parseResponse(), { status: 200 })))
  })

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the real encrypted PDF/photo upload card instead of a placeholder (#444)', async () => {
    mockReceipts([])
    renderReceipts()
    await screen.findByText('Beleg hochladen (PDF / Foto)')
    expect(screen.getByTestId('belege-upload-card')).toBeTruthy()
    expect(screen.getByTestId('belege-upload-cta')).toBeTruthy()
    // No kind to pick any more: the reading recognises the document (ADR-0097 §4).
    expect(screen.queryByLabelText('Belegart')).toBeNull()
    expect(screen.queryByText(/folgt noch/)).toBeNull()
  })

  it('rejects an unsupported file format on upload without calling the API', async () => {
    mockReceipts([])
    let uploadCalls = 0
    server.use(
      http.post('*/v1/belege/upload', () => {
        uploadCalls += 1
        return HttpResponse.json(ASSIGNED, { status: 201 })
      }),
    )
    renderReceipts()
    await screen.findByTestId('belege-file-input')

    const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [badFile] } })

    expect(await screen.findByText('Bitte wähle eine PDF-, JPEG-, PNG- oder WebP-Datei aus.')).toBeTruthy()
    expect(uploadCalls).toBe(0)
  })

  it('uploads a receipt and reads it right away with its drafts staged, like the chat (ADR-0097 §4)', async () => {
    let list: ReceiptResponseDto[] = []
    const parseBodies: unknown[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung 50,00 EUR', usedOcrFallback: false, pagesProcessed: 1 })
    server.use(
      receiptInboxHandler(() => list),
      http.post('*/v1/belege/upload', () => {
        list = [ASSIGNED]
        return HttpResponse.json(ASSIGNED, { status: 201 })
      }),
      http.post('*/v1/belege/parse', async ({ request }) => {
        parseBodies.push(await request.json())
        list = [{ ...ASSIGNED, processing: { state: 'vorschlaege', reason: null, pending: 1, applied: 0, dismissed: 0, draftsTaxYear: 2025, open: true } }]
        return HttpResponse.json(parseResponse({ draftsTaxYear: 2025 }), { status: 200 })
      }),
    )
    renderReceipts()
    await screen.findByText('Noch keine Belege.')

    const pdfFile = new File(['%PDF-1.4\ntest'], 'lohnausweis-2026.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [pdfFile] } })

    expect(await screen.findByText('Beleg gespeichert. Er wird jetzt gelesen.')).toBeTruthy()
    expect(await screen.findByText('lohnausweis-2026.pdf')).toBeTruthy()
    expect(screen.getByText('Originaldatei verschlüsselt hinterlegt')).toBeTruthy()

    const uploadCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/v1/belege/upload'))
    expect(uploadCall).toBeTruthy()
    const body = uploadCall![1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('kind')).toBe('Sonstiges')
    const uploadedFile = (body as FormData).get('file')
    expect(uploadedFile).toBeInstanceOf(File)
    expect((uploadedFile as File).name).toBe('lohnausweis-2026.pdf')

    // Read once, with the stored Beleg and its drafts staged; no second upload.
    await waitFor(() => expect(parseBodies).toHaveLength(1))
    expect(parseBodies[0]).toMatchObject({ receiptId: ASSIGNED.id, stageDraft: true, fileName: 'lohnausweis-2026.pdf' })
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/v1/belege/upload'))).toHaveLength(1)
    expect((await screen.findByTestId(`receipt-${ASSIGNED.id}-stand`)).textContent).toBe('1 Wert wartet auf dich')
  })

  it('records a file the device cannot read on its Beleg and offers to read it again', async () => {
    let list: ReceiptResponseDto[] = []
    const parseBodies: unknown[] = []
    mockExtractDocumentText.mockRejectedValue(new Error('Invalid PDF structure'))
    server.use(
      receiptInboxHandler(() => list),
      http.post('*/v1/belege/upload', () => {
        list = [ASSIGNED]
        return HttpResponse.json(ASSIGNED, { status: 201 })
      }),
      http.post('*/v1/belege/parse', async ({ request }) => {
        parseBodies.push(await request.json())
        const processing = { state: 'nicht_lesbar', reason: 'unlesbar', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true } as const
        list = [{ ...ASSIGNED, processing }]
        return HttpResponse.json(parseResponse({ processing }), { status: 200 })
      }),
    )
    renderReceipts()
    await screen.findByText('Noch keine Belege.')
    fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [new File(['%PDF-1.4'], 'kaputt.pdf', { type: 'application/pdf' })] } })

    expect((await screen.findByTestId(`receipt-${ASSIGNED.id}-stand`, {}, { timeout: 5000 })).textContent).toBe('Nicht lesbar')
    await waitFor(() => expect(parseBodies).toEqual([expect.objectContaining({ receiptId: ASSIGNED.id, deviceReadFailure: 'read_failed' })]))
    expect(screen.getByTestId(`receipt-${ASSIGNED.id}-grund`).textContent).toContain('ließ sich auf deinem Gerät nicht öffnen')
    expect(screen.getByTestId(`receipt-eule-${ASSIGNED.id}`).textContent).toBe('Noch mal lesen')
  })

  it('shows an honest error when multipart upload fails on the server', async () => {
    mockReceipts([])
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ message: 'Server error' }, { status: 500 })))
    renderReceipts()
    await screen.findByTestId('belege-file-input')

    const imgFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [imgFile] } })

    // WEB-10: a 500 is the server's fault, not the connection.
    expect(await screen.findByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
  })

  it('opens ReceiptFileModal for PDF and image files and strictly revokes ObjectURLs on close', async () => {
    const IMAGE_RECEIPT: ReceiptResponseDto = {
      id: 'b-foto',
      fileName: 'quittung.png',
      kind: 'Sonstiges',
      belegdatum: null,
      zahlungsdatum: null,
      hasFile: true,
      holders: [],
      holderTaxYear: null,
      processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
      filledFields: [],
      duplicateOf: null,
      mimeType: 'image/png',
      byteLength: 128,
      assignment: { kind: 'ungebunden' },
    }
    mockReceipts([ASSIGNED, IMAGE_RECEIPT])
    const createdUrls: string[] = []
    const revokedUrls: string[] = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:http://localhost/test-${createdUrls.length + 1}`
      createdUrls.push(url)
      return url
    })
    URL.revokeObjectURL = vi.fn((u: string) => {
      revokedUrls.push(u)
    })

    try {
      server.use(
        http.get('*/v1/belege/b-zugeordnet/datei', () => {
          return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
          })
        }),
        http.get('*/v1/belege/b-foto/datei', () => {
          return new HttpResponse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          })
        }),
      )

      renderReceipts()
      await screen.findByTestId('receipt-preview-b-zugeordnet')

      // Open PDF preview -> iframe + download link
      fireEvent.click(screen.getByTestId('receipt-preview-b-zugeordnet'))
      expect(await screen.findByTestId('receipt-file-modal')).toBeTruthy()
      expect(await screen.findByTitle('lohnausweis-2026.pdf')).toBeTruthy()
      expect(screen.getByText('Herunterladen')).toBeTruthy()

      // Close revokes first ObjectURL
      fireEvent.click(screen.getByTestId('receipt-file-close'))
      await waitFor(() => expect(revokedUrls).toContain('blob:http://localhost/test-1'))

      // Open PNG preview -> <img>
      fireEvent.click(screen.getByTestId('receipt-preview-b-foto'))
      expect(await screen.findByAltText('quittung.png')).toBeTruthy()

      // Close revokes second ObjectURL
      fireEvent.click(screen.getByTestId('receipt-file-close'))
      await waitFor(() => expect(revokedUrls).toContain('blob:http://localhost/test-2'))
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })

  it('shows an honest preview error when GET /v1/belege/:id/datei returns 404', async () => {
    mockReceipts([ASSIGNED])
    server.use(http.get('*/v1/belege/b-zugeordnet/datei', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })))

    renderReceipts()
    await screen.findByTestId('receipt-preview-b-zugeordnet')
    fireEvent.click(screen.getByTestId('receipt-preview-b-zugeordnet'))

    expect(
      await screen.findByText('Die Originaldatei konnte nicht geladen werden (möglicherweise bereits gelöscht).'),
    ).toBeTruthy()
  })

  it('requires two-step inline confirmation before deleting a receipt and handles delete failure honestly', async () => {
    let list: ReceiptResponseDto[] = [ASSIGNED]
    let deleteCalls = 0
    let failDelete = true
    server.use(
      receiptInboxHandler(() => list),
      http.delete('*/v1/belege/b-zugeordnet', () => {
        deleteCalls += 1
        if (failDelete) {
          return HttpResponse.json({ message: 'fail' }, { status: 500 })
        }
        list = []
        return HttpResponse.json({ deleted: true }, { status: 200 })
      }),
    )

    renderReceipts()
    await screen.findByTestId('receipt-delete-b-zugeordnet')

    // Step 1: open confirm -> cancel -> 0 DELETE calls
    fireEvent.click(screen.getByTestId('receipt-delete-b-zugeordnet'))
    expect(await screen.findByText('Beleg endgültig löschen?')).toBeTruthy()
    fireEvent.click(screen.getByText('Abbrechen'))
    expect(deleteCalls).toBe(0)

    // Step 2: confirm when server fails -> shows error
    fireEvent.click(screen.getByTestId('receipt-delete-b-zugeordnet'))
    fireEvent.click(screen.getByTestId('receipt-delete-confirm-b-zugeordnet'))
    expect(await screen.findByText('Der Beleg konnte nicht gelöscht werden.')).toBeTruthy()
    expect(deleteCalls).toBe(1)

    // Step 3: confirm succeeds -> deletes and shows empty inbox
    failDelete = false
    fireEvent.click(screen.getByTestId('receipt-delete-confirm-b-zugeordnet'))
    await screen.findByText('Noch keine Belege.')
    expect(deleteCalls).toBe(2)
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
    // `art: 'Lohnausweis'` → label; `art: null` → the generic "Beleg" (on the card badge; no kind to pick at the upload)
    expect(screen.getAllByText('Lohnausweis').length).toBe(1)
    expect(screen.getAllByText('Sonstiges').length).toBe(1)
    expect(screen.getByText('Beleg')).toBeTruthy()
  })

  it('counts "offen" as not fully processed (ADR-0097 §1), not as without a year', async () => {
    // ASSIGNED has its year but is not read yet: open. CONFLICT has no settled year but is done: not open.
    mockReceipts([UNBOUND, PROPOSED, ASSIGNED, { ...CONFLICT, processing: PROCESSING_DONE }])
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
      receiptInboxHandler(() => list),
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
      receiptInboxHandler(() => list),
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
      receiptInboxHandler(() => list),
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
      receiptInboxHandler(() => list),
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

    await screen.findByText('Das konnte nicht geladen werden.')
    expect(screen.getByText('Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.')).toBeTruthy()

    mockReceipts([ASSIGNED])
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Zugeordnet: 2026')
  })

  it('treats a non-200 response as an honest error, not a silent empty fallthrough', async () => {
    server.use(http.get(RECEIPTS_URL, () => HttpResponse.json([], { status: 500 })))
    renderReceipts()
    expect(await screen.findByText('Das konnte nicht geladen werden.')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    mockReceipts([PROPOSED, CONFLICT, ASSIGNED])
    renderReceipts({ lng: 'en' })
    expect(await screen.findByText('Receipts')).toBeTruthy()
    expect(screen.getByText('Upload receipt (PDF / photo)')).toBeTruthy()
    expect(screen.getByText('Upload PDF or photo')).toBeTruthy()
    expect(screen.getByText('Suggestion: 2026')).toBeTruthy()
    expect(screen.getByText('Two years for this receipt — you decide.')).toBeTruthy()
    expect(screen.getByText('Adopt suggestion 2026')).toBeTruthy()
    expect(screen.getByText('Keep 2025')).toBeTruthy()
    expect(screen.getByText('View receipt')).toBeTruthy()
    expect(screen.getAllByText('Delete').length).toBe(3)
  })

  it('refetches the inbox after a successful assignment so the derived state never goes stale', async () => {
    let getCalls = 0
    server.use(
      http.get(RECEIPTS_URL, () => {
        getCalls += 1
        return HttpResponse.json(receiptPage(getCalls === 1 ? [PROPOSED] : [ASSIGNED]), { status: 200 })
      }),
      http.post('*/v1/belege/:id/zuordnung', () => HttpResponse.json(ASSIGNED, { status: 200 })),
    )
    renderReceipts()

    await screen.findByText('Vorschlag: 2026')
    fireEvent.click(screen.getByText('Zuordnen zu 2026'))
    await waitFor(() => expect(screen.getByText('Zugeordnet: 2026')).toBeTruthy())
    expect(getCalls).toBe(2)
  })

  describe('„für: <Name>“ (ADR-0092)', () => {
    function mockHousehold() {
      server.use(
        http.get('*/v1/profile', () => HttpResponse.json({ firstName: 'Elias', lastName: 'Sommer', steuerId: null, steuernummer: null })),
        http.get('*/v1/steuerjahre/2025/kopplung', () => HttpResponse.json({ filingType: 'zusammen', personBUserId: 'b1', personB: { firstName: 'Nora' } })),
        http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json({ kinder: [], count: 0, childBenefitSum: 0, totalAllowance: 0, swissFamilyAllowanceSum: 0 })),
      )
    }

    it('shows whose a document is and gives it to another person with its values', async () => {
      mockHousehold()
      let body: Record<string, unknown> | null = null
      server.use(
        http.post('*/v1/belege/b-lstb/inhaber', async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ holders: ['B'], takenBack: 3, applied: 3, waiting: 1, parse: null })
        }),
      )
      mockReceipts([{ ...CONFLICT, id: 'b-lstb', fileName: 'lstb.pdf', holders: ['A'], holderTaxYear: 2025 }])
      renderReceipts()
      const chip = await screen.findByTestId('beleg-inhaber-b-lstb')
      await waitFor(() => expect(chip.textContent).toBe('für: Elias'))
      fireEvent.click(chip)
      fireEvent.click(await screen.findByTestId('beleg-inhaber-wahl-b-lstb-B'))
      const outcome = await screen.findByTestId('beleg-inhaber-ergebnis-b-lstb')
      expect(outcome.textContent).toContain('Der Beleg gehört jetzt Nora: 3 Werte übernommen, 3 bei der Person vorher zurückgenommen.')
      expect(outcome.textContent).toContain('1 Entwürfe warten')
      expect(body).toEqual({ taxYear: 2025, holder: 'B' })
    })

    it('says when nobody is chosen yet, and when giving it away failed', async () => {
      mockHousehold()
      server.use(http.post('*/v1/belege/b-offen/inhaber', () => HttpResponse.json({ code: 'X' }, { status: 400 })))
      mockReceipts([{ ...CONFLICT, id: 'b-offen', holders: [], holderTaxYear: 2025 }])
      renderReceipts()
      const chip = await screen.findByTestId('beleg-inhaber-b-offen')
      expect(chip.textContent).toBe('für: noch niemand')
      fireEvent.click(chip)
      fireEvent.click(await screen.findByTestId('beleg-inhaber-wahl-b-offen-A'))
      expect((await screen.findByTestId('beleg-inhaber-ergebnis-b-offen')).textContent).toContain('nicht geklappt')
    })

    it('NR-09: a household that did not load says so with a retry, never only "Person A"', async () => {
      server.use(
        http.get('*/v1/profile', () => HttpResponse.json({ firstName: 'Elias', lastName: 'Sommer', steuerId: null, steuernummer: null })),
        http.get('*/v1/steuerjahre/2025/kopplung', () => HttpResponse.json({ statusCode: 500 }, { status: 500 })),
        http.get('*/v1/steuerjahre/2025/kinder', () => HttpResponse.json({ kinder: [], count: 0, childBenefitSum: 0, totalAllowance: 0, swissFamilyAllowanceSum: 0 })),
      )
      mockReceipts([{ ...CONFLICT, id: 'b-offen', holders: [], holderTaxYear: 2025 }])
      renderReceipts()
      fireEvent.click(await screen.findByTestId('beleg-inhaber-b-offen'))
      expect(await screen.findByTestId('beleg-inhaber-ladefehler-b-offen')).toBeTruthy()
      expect(screen.queryByTestId('beleg-inhaber-wahl-b-offen-A')).toBeNull()
    })
  })

  describe('Smarte Ordner-Kategorisierung & Steuerbescheid-Abgleich (4.2 & 4.3)', () => {
    it('groups receipts into smart folders and filters by category', async () => {
      mockReceipts([ASSIGNED, PROPOSED])
      renderReceipts()

      await screen.findByText('lohnausweis-2026.pdf')
      expect(screen.getByTestId('receipt-folder-b-zugeordnet').textContent).toContain('2026 / Einkünfte & Lohn')
      expect(screen.getByTestId('belege-ordner-einkuenfte').textContent).toContain('(1)')

      // The server filters by folder: the other Beleg leaves once the folder's page has arrived.
      fireEvent.click(screen.getByTestId('belege-ordner-einkuenfte'))
      await waitFor(() => expect(screen.queryByText('rechnung-fortbildung.pdf')).toBeNull())
      expect(screen.getByText('lohnausweis-2026.pdf')).toBeTruthy()
      expect(screen.getByTestId('belege-ordner-weitere').textContent).toContain('(1)')
    })

    it('loads the Belege in pages and counts over all of them, not just the pages shown', async () => {
      const many = Array.from({ length: 31 }, (_, n) => ({ ...UNBOUND, id: `b-${n}`, fileName: `beleg-${n}.pdf` }))
      mockReceipts(many)
      renderReceipts()

      await screen.findByText('beleg-0.pdf')
      expect(screen.queryByText('beleg-30.pdf')).toBeNull()
      expect(screen.getByTestId('belege-ordner-alle').textContent).toContain('(31)')

      fireEvent.click(screen.getByTestId('belege-mehr-laden'))
      await screen.findByText('beleg-30.pdf')
      expect(screen.queryByTestId('belege-mehr-laden')).toBeNull()
    })

    it('imports a Steuerbescheid via BescheidCheckCard and shows the comparison status', async () => {
      mockReceipts([])
      server.use(
        http.post('*/v1/belege/upload', () =>
          HttpResponse.json({ ...ASSIGNED, id: 'b-bescheid', fileName: 'bescheid-2025.pdf', kind: 'Steuerbescheid' }, { status: 201 }),
        ),
      )
      renderReceipts()
      await screen.findByTestId('belege-bescheid-check-card')

      const pdfFile = new File(['%PDF-1.4\nbescheid'], 'bescheid-2025.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByTestId('belege-bescheid-file-input'), { target: { files: [pdfFile] } })

      const status = await screen.findByTestId('belege-bescheid-check-status')
      expect(status.textContent).toContain('bescheid-2025.pdf')
      expect(status.textContent).toContain('gespeichert')
    })
  })
  describe('one tap for every proposal (UX review 2026-11)', () => {
    it('assigns all waiting proposals at once and leaves a conflict alone', async () => {
      const second = { ...PROPOSED, id: 'b-vorschlag-2', fileName: 'zweiter.pdf' }
      mockReceipts([PROPOSED, second, CONFLICT])
      const assigned: string[] = []
      server.use(
        http.post('*/v1/belege/:id/zuordnung', ({ params }) => {
          assigned.push(String(params.id))
          return HttpResponse.json({ ...ASSIGNED, id: String(params.id) }, { status: 200 })
        }),
      )
      renderReceipts()

      fireEvent.click(await screen.findByTestId('belege-alle-zuordnen'))

      await waitFor(() => expect(assigned.sort()).toEqual([PROPOSED.id, second.id].sort()))
    })

    it('offers no bulk action for a single proposal', async () => {
      mockReceipts([PROPOSED, ASSIGNED])
      renderReceipts()
      await screen.findByTestId('belege-ordner-filter')
      expect(screen.queryByTestId('belege-alle-zuordnen')).toBeNull()
    })

    it('no longer claims a sync with the chat that does not exist', async () => {
      mockReceipts([ASSIGNED])
      renderReceipts()
      expect((await screen.findByTestId(`receipt-folder-${ASSIGNED.id}`)).textContent).not.toContain('synchronisiert')
    })
  })

  // ADR-0097: every Beleg says what became of it, from the server's derived state.
  describe('what became of a Beleg (ADR-0097)', () => {
    const read = (id: string, fileName: string, processing: ReceiptResponseDto['processing'], extra: Partial<ReceiptResponseDto> = {}): ReceiptResponseDto => ({
      ...ASSIGNED,
      id,
      fileName,
      kind: 'Sonstiges',
      processing,
      ...extra,
    })
    const SPENDE_FIELD = { actionId: 'a-1', taxYear: 2025, screen: 'interview', field: 'spenden-betrag', instance: null, person: 'A', label: 'Spenden', value: '3135' } as const

    it('files a Beleg under the year its values went to, dates in German, and asks no year for nothing usable', async () => {
      mockReceipts([
        read('b-2024', 'spende-2024.pdf', { state: 'vorschlaege', reason: null, pending: 1, applied: 0, dismissed: 0, draftsTaxYear: 2024, open: true }, { assignment: { kind: 'ungebunden' }, holderTaxYear: null, belegdatum: '2025-07-16' }),
        read('b-waage', 'waage.pdf', { state: 'nichts_verwertbar', reason: 'nicht_absetzbar', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: false }, { assignment: { kind: 'ungebunden' } }),
      ])
      renderReceipts()
      expect((await screen.findByTestId('receipt-folder-b-2024')).textContent).toMatch(/^2024 \//)
      expect(screen.getByText('16.07.2025')).toBeTruthy()
      expect(screen.queryByText('2025-07-16')).toBeNull()
      // Only the Beleg with a value still waits for a year; the scale says nothing about years.
      expect(screen.getAllByText('Unzugeordnet')).toHaveLength(1)
    })

    it('says each state in plain words, with the reason and the way on', async () => {
      mockReceipts([
        read('b-wartet', 'spende.pdf', { state: 'vorschlaege', reason: null, pending: 2, applied: 0, dismissed: 0, draftsTaxYear: 2025, open: true }),
        read('b-fertig', 'arbeitsmittel.pdf', { state: 'uebernommen', reason: null, pending: 0, applied: 3, dismissed: 0, draftsTaxYear: 2025, open: false }),
        read('b-angebot', 'handwerker.pdf', { state: 'nichts_verwertbar', reason: 'keine_rechnung', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: false }),
        read('b-leer', 'zettel.pdf', { state: 'nichts_verwertbar', reason: 'nichts_erkannt', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: false }),
        read('b-weg', 'verworfen.pdf', { state: 'verworfen', reason: null, pending: 0, applied: 0, dismissed: 1, draftsTaxYear: 2025, open: false }),
        read('b-neu', 'neu.pdf', { state: 'neu', reason: 'entwuerfe_fehlen', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true }),
      ])
      renderReceipts()
      expect((await screen.findByTestId('receipt-b-wartet-stand')).textContent).toBe('2 Werte warten auf dich')
      expect(screen.getByTestId('receipt-b-fertig-stand').textContent).toBe('Gelesen · 3 Werte übernommen')
      expect(screen.getByTestId('receipt-b-angebot-stand').textContent).toBe('Nichts für die Erklärung: keine Rechnung')
      expect(screen.getByTestId('receipt-b-angebot-grund').textContent).toBe('Das ist eine Auftragsbestätigung oder ein Angebot. Es zählt erst die Rechnung.')
      expect(screen.getByTestId('receipt-b-leer-stand').textContent).toBe('Nichts erkannt')
      expect(screen.getByTestId('receipt-b-weg-stand').textContent).toBe('Gelesen · Vorschläge verworfen')
      expect(screen.getByTestId('receipt-b-neu-stand').textContent).toBe('Gelesen, aber die Vorschläge sind weg')
      // Only a Beleg that is not read, or failed, is read again from its card.
      expect(screen.getByTestId('receipt-eule-b-neu')).toBeTruthy()
      expect(screen.queryByTestId('receipt-eule-b-fertig')).toBeNull()
      expect(screen.getByText('2 offen')).toBeTruthy()
    })

    it('names a reason for every code in both languages', async () => {
      const codes = ['nichts_erkannt', 'keine_rechnung', 'nicht_absetzbar', 'schon_gezaehlt', 'dublette', 'blockiert', 'kein_steuerjahr', 'anderes_konto', 'lesefehler', 'unlesbar', 'kein_text', 'nicht_unterstuetzt', 'entwuerfe_fehlen'] as const
      for (const lng of ['de', 'en'] as const) {
        const i18n = createAppI18n(lng)
        for (const code of codes) {
          expect(i18n.exists(`belege.grund.${code}`, { ns: 'app' }), `${lng} belege.grund.${code}`).toBe(true)
          expect(i18n.exists(`belege.grundSatz.${code}`, { ns: 'app' }), `${lng} belege.grundSatz.${code}`).toBe(true)
        }
      }
    })

    it('says when its drafts sit in another tax year and switches there, and leads to the drafts', async () => {
      sessionStorage.clear()
      mockReceipts([read('b-2024', 'spende-2024.pdf', { state: 'vorschlaege', reason: null, pending: 1, applied: 0, dismissed: 0, draftsTaxYear: 2020, open: true })])
      renderReceipts({ shell: true })
      expect((await screen.findByTestId('receipt-b-2024-jahr')).textContent).toBe('Liegt im Steuerjahr 2020')
      expect(screen.getByTestId('receipt-b-2024-zu-vorschlaegen').textContent).toBe('Zu den Vorschlägen')
      fireEvent.click(screen.getByTestId('receipt-b-2024-jahr-wechseln'))
      expect(screen.getByTestId('shell-year').textContent).toBe('2020')
      sessionStorage.clear()
    })

    it('names a duplicate upload with the first one', async () => {
      mockReceipts([
        read('b-doppelt', 'spende-2025 (1).pdf', { state: 'nichts_verwertbar', reason: 'dublette', pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: false }, {
          duplicateOf: { id: 'b-erst', fileName: 'spende-2025.pdf', uploadedAt: '2026-11-18T09:12:00.000Z' },
        }),
      ])
      renderReceipts()
      expect((await screen.findByTestId('receipt-b-doppelt-dublette')).textContent).toBe('Doppelt: schon am 18.11.2026 hochgeladen (spende-2025.pdf)')
    })

    it('lists the values it filled, with their amount and year', async () => {
      mockReceipts([read('b-spende', 'spende.pdf', { state: 'uebernommen', reason: null, pending: 0, applied: 1, dismissed: 0, draftsTaxYear: 2025, open: false }, { filledFields: [SPENDE_FIELD] })])
      renderReceipts()
      expect((await screen.findByTestId('receipt-b-spende-gefuellt')).textContent).toBe('hat gefüllt: Spenden 3.135\u00a0€ · Steuerjahr 2025')
    })

    it('asks on delete whether its values go too, „ja“ first, and says what was taken back', async () => {
      const receipt = read('b-spende', 'spende.pdf', { state: 'uebernommen', reason: null, pending: 0, applied: 1, dismissed: 0, draftsTaxYear: 2025, open: false }, { filledFields: [SPENDE_FIELD] })
      let list: ReceiptResponseDto[] = [receipt]
      const calls: string[] = []
      server.use(
        receiptInboxHandler(() => list),
        http.delete('*/v1/belege/b-spende', ({ request }) => {
          calls.push(new URL(request.url).searchParams.get('takeBackValues') ?? 'none')
          list = []
          return HttpResponse.json({ deleted: true, takenBack: 1, withdrawn: 0 }, { status: 200 })
        }),
      )
      renderReceipts()
      fireEvent.click(await screen.findByTestId('receipt-delete-b-spende'))
      expect(screen.getByTestId('receipt-delete-frage-b-spende').textContent).toContain('Dieser Beleg hat Spenden 3.135\u00a0€ · Steuerjahr 2025 gefüllt. Werte auch entfernen?')
      // „Ja, Werte entfernen“ is the primary choice; „Nur den Beleg löschen“ the other one.
      expect(screen.getByTestId('receipt-delete-werte-b-spende').textContent).toBe('Ja, Werte entfernen')
      expect(screen.getByTestId('receipt-delete-nur-beleg-b-spende').textContent).toBe('Nur den Beleg löschen')
      expect(screen.queryByTestId('receipt-delete-confirm-b-spende')).toBeNull()
      fireEvent.click(screen.getByTestId('receipt-delete-werte-b-spende'))
      expect((await screen.findByTestId('belege-delete-ergebnis')).textContent).toBe('„spende.pdf“ gelöscht. · 1 Wert entfernt')
      expect(calls).toEqual(['true'])
    })

    it('deletes only the Beleg when asked so, and says that its values stay', async () => {
      const receipt = read('b-wartend', 'spende.pdf', { state: 'vorschlaege', reason: null, pending: 2, applied: 0, dismissed: 0, draftsTaxYear: 2025, open: true })
      const calls: string[] = []
      server.use(
        receiptInboxHandler(() => (calls.length > 0 ? [] : [receipt])),
        http.delete('*/v1/belege/b-wartend', ({ request }) => {
          calls.push(new URL(request.url).searchParams.get('takeBackValues') ?? 'none')
          return HttpResponse.json({ deleted: true, takenBack: 0, withdrawn: 0 }, { status: 200 })
        }),
      )
      renderReceipts()
      fireEvent.click(await screen.findByTestId('receipt-delete-b-wartend'))
      expect(screen.getByTestId('receipt-delete-frage-b-wartend').textContent).toContain('Von diesem Beleg warten noch 2 Vorschläge. Auch zurückziehen?')
      fireEvent.click(screen.getByTestId('receipt-delete-nur-beleg-b-wartend'))
      expect((await screen.findByTestId('belege-delete-ergebnis')).textContent).toBe('„spende.pdf“ gelöscht. Seine Werte bleiben in deiner Erklärung.')
      expect(calls).toEqual(['false'])
    })

    it('keeps the question whose a Beleg is on its card, and reads it for the answer', async () => {
      const question: AssignmentQuestionDto = { reason: 'which', options: [{ holder: 'A', name: 'Mia' }, { holder: 'B', name: 'Jonas' }], preselected: 'A', printedName: null, area: null, offerCreate: [] }
      let list: ReceiptResponseDto[] = []
      const parseBodies: { holder?: string }[] = []
      mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung Jonas 50 EUR', usedOcrFallback: false, pagesProcessed: 1 })
      server.use(
        receiptInboxHandler(() => list),
        http.post('*/v1/belege/upload', () => {
          list = [ASSIGNED]
          return HttpResponse.json(ASSIGNED, { status: 201 })
        }),
        http.post('*/v1/belege/parse', async ({ request }) => {
          const body = (await request.json()) as { holder?: string }
          parseBodies.push(body)
          return body.holder === undefined
            ? HttpResponse.json(parseResponse({ assignment: { holder: null, question, alsoFor: [] } }), { status: 200 })
            : HttpResponse.json(parseResponse({ assignment: { holder: { holder: 'B', name: 'Jonas' }, question: null, alsoFor: [] } }), { status: 200 })
        }),
      )
      renderReceipts()
      await screen.findByText('Noch keine Belege.')
      fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [new File(['%PDF-1.4'], 'spende-jonas.pdf', { type: 'application/pdf' })] } })

      const card = await screen.findByTestId(`receipt-${ASSIGNED.id}-zuordnung`)
      expect(card.textContent).toContain('Für wen ist dieser Beleg?')
      expect(screen.getByTestId(`receipt-${ASSIGNED.id}-stand`).textContent).toBe('Wartet auf deine Antwort, für wen er ist')
      fireEvent.click(screen.getByTestId('beleg-zuordnung-fuer-B'))
      await waitFor(() => expect(parseBodies.map((b) => b.holder)).toEqual([undefined, 'B']))
      await waitFor(() => expect(screen.queryByTestId(`receipt-${ASSIGNED.id}-zuordnung`)).toBeNull())
    })

    it('reads the Steuerbescheid through the same pipeline', async () => {
      mockReceipts([])
      const parseBodies: unknown[] = []
      mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Bescheid für 2025 über Einkommensteuer', usedOcrFallback: false, pagesProcessed: 1 })
      server.use(
        http.post('*/v1/belege/upload', () => HttpResponse.json({ ...ASSIGNED, id: 'b-bescheid', kind: 'Steuerbescheid' }, { status: 201 })),
        http.post('*/v1/belege/parse', async ({ request }) => {
          parseBodies.push(await request.json())
          return HttpResponse.json(parseResponse(), { status: 200 })
        }),
      )
      renderReceipts()
      await screen.findByTestId('belege-bescheid-check-card')
      fireEvent.change(screen.getByTestId('belege-bescheid-file-input'), { target: { files: [new File(['%PDF-1.4'], 'bescheid-2025.pdf', { type: 'application/pdf' })] } })
      expect((await screen.findByTestId('belege-bescheid-check-status')).textContent).toContain('gelesen')
      expect(parseBodies).toEqual([expect.objectContaining({ receiptId: 'b-bescheid', stageDraft: true })])
    })
  })
})

describe('BelegeScreen — failures say what happened (WEB-10, WEB-11, NR-08, WEB-28)', () => {
  function upload() {
    const pdfFile = new File(['%PDF-1.4\ntest'], 'beleg.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('belege-file-input'), { target: { files: [pdfFile] } })
  }

  it('names the 10 MB limit before and after a 413', async () => {
    mockReceipts([])
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ statusCode: 413 }, { status: 413 })))
    renderReceipts()
    await screen.findByTestId('belege-file-input')
    expect(screen.getByTestId('belege-upload-grenze').textContent).toContain('10 MB')
    upload()
    expect(await screen.findByText('Die Datei ist zu groß. Erlaubt sind höchstens 10 MB.')).toBeTruthy()
  })

  it('reads Retry-After on a 429 (the guest quota) instead of blaming the connection', async () => {
    mockReceipts([])
    server.use(http.post('*/v1/belege/upload', () => HttpResponse.json({ statusCode: 429 }, { status: 429, headers: { 'Retry-After': '30' } })))
    renderReceipts()
    await screen.findByTestId('belege-file-input')
    upload()
    expect(await screen.findByText('Gerade kommen zu viele Anfragen. Versuch es in 30 Sekunden noch mal.')).toBeTruthy()
  })

  it('WEB-11: a guest whose upload is stored hears that reading needs an account', async () => {
    let list: ReceiptResponseDto[] = []
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Spendenbescheinigung 50,00 EUR', usedOcrFallback: false, pagesProcessed: 1 })
    server.use(
      receiptInboxHandler(() => list),
      http.post('*/v1/belege/upload', () => {
        list = [ASSIGNED]
        return HttpResponse.json(ASSIGNED, { status: 201 })
      }),
      http.post('*/v1/belege/parse', () => HttpResponse.json({ statusCode: 403, code: 'ACCOUNT_REQUIRED' }, { status: 403 })),
    )
    renderReceipts()
    await screen.findByText('Noch keine Belege.')
    upload()
    expect(
      await screen.findByText('Der Beleg ist gespeichert. Auslesen lassen kannst du ihn mit einem kostenlosen Konto – oder du trägst die Beträge selbst ein.'),
    ).toBeTruthy()
  })

  it('NR-08: a failed year assignment is said on screen, not only a vibration', async () => {
    mockReceipts([PROPOSED])
    server.use(http.post('*/v1/belege/:id/zuordnung', () => HttpResponse.json({ statusCode: 500 }, { status: 500 })))
    renderReceipts()
    fireEvent.click(await screen.findByText('Zuordnen zu 2026'))
    expect((await screen.findByTestId('speichern-fehlgeschlagen')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen.')
  })

  it('fails closed: every request answering 500 shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderReceipts()
    await expectFailsClosed(failing)
  })
})
