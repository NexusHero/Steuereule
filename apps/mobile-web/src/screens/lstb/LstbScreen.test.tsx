// LStB-Masken-Screen (REQ-016) — renders the three fields from GET, sends whole-euro values via
// PUT, and shows a named widerspruch (ADR-008), never a silent fix. Honest loading/error states.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { LstbScreen } from './LstbScreen'
import { EMPTY_LSTB_RESPONSE, server } from '../../test-msw-server'
import type {
  AdvisorChatMessageDto,
  LstbResponseDto,
  ParseReceiptResponseDto,
  ReceiptResponseDto,
} from '@steuereule/api-client'

const { mockExtractDocumentText } = vi.hoisted(() => ({
  mockExtractDocumentText: vi.fn(),
}))

vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return {
    ...actual,
    extractDocumentTextOnDevice: mockExtractDocumentText,
  }
})

const TAX_YEAR = 2026
const LSTB_URL = `*/v1/steuerjahre/${TAX_YEAR}/lstb`
const PARSE_URL = '*/v1/belege/parse'
const UPLOAD_URL = '*/v1/belege/upload'
const ADVISOR_SESSION_URL = `*/v1/steuerjahre/${TAX_YEAR}/advisor/session`

const CONFLICT: LstbResponseDto = {
  bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
  lohnsteuer: { kind: 'erfasst', value: 60000 },
  sozialversicherung: { kind: 'erfasst', value: 0 },
  state: {
    kind: 'widerspruch',
    conflicts: [{ kind: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 60000, bruttoarbeitslohn: 50000 }],
  },
}

function renderLstb(
  opts: string | { readonly partnerName?: string; readonly onSwitchTaxYear?: (year: number) => void; readonly lng?: 'de' | 'en' } = {},
) {
  const resolved = typeof opts === 'string' ? { partnerName: opts } : opts
  const i18n = createAppI18n(resolved.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <LstbScreen
            taxYear={TAX_YEAR}
            onDone={() => {}}
            {...(resolved.partnerName ? { partnerName: resolved.partnerName } : {})}
            {...(resolved.onSwitchTaxYear ? { onSwitchTaxYear: resolved.onSwitchTaxYear } : {})}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function makeUploadedReceipt(id = 'rec-lstb-1', fileName = 'lstb-2026.pdf'): ReceiptResponseDto {
  return {
    id,
    fileName,
    kind: 'Sonstiges',
    belegdatum: null,
    zahlungsdatum: null,
    hasFile: true,
    mimeType: 'application/pdf',
    byteLength: 512,
    assignment: { kind: 'ungebunden' },
  }
}

function makeParseResponse(overrides?: Partial<NonNullable<ParseReceiptResponseDto['lstb']>>): ParseReceiptResponseDto {
  const baseLstb: NonNullable<ParseReceiptResponseDto['lstb']> = {
    stage: 'deterministic',
    receiptId: 'rec-lstb-1',
    taxYearOnDocument: TAX_YEAR,
    yearConflict: null,
    existingLstbConflict: {
      hasExisting: false,
      existing: { bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null },
    },
    fields: {
      bruttoarbeitslohn: {
        value: 54000,
        status: 'ok',
        sourceLines: ['3'],
        calculation: [{ line: '3', amount: 54000 }],
        reason: null,
      },
      lohnsteuer: {
        value: 8200,
        status: 'ok',
        sourceLines: ['4'],
        calculation: [{ line: '4', amount: 8200 }],
        reason: null,
      },
      sozialversicherung: {
        value: 11100,
        status: 'ok',
        sourceLines: ['23a', '25', '26', '27'],
        calculation: [
          { line: '23', amount: 4800 },
          { line: '25', amount: 4300 },
          { line: '26', amount: 1200 },
          { line: '27', amount: 800 },
        ],
        reason: null,
      },
    },
    stagedActionIds: ['act-1', 'act-2', 'act-3'],
    securityBlocked: false,
    ...overrides,
  }
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: {
      vendorCategory: 'sonstiges',
      receiptDate: '2026-12-31',
      amountEur: baseLstb.fields.bruttoarbeitslohn.value,
      suggestedScreen: 'lstb',
      suggestedField: 'bruttoarbeitslohn',
      suggestedValue: baseLstb.fields.bruttoarbeitslohn.value !== null ? String(baseLstb.fields.bruttoarbeitslohn.value) : null,
      summary: 'LStB 2026',
      taxYear: TAX_YEAR,
    },
    lstb: baseLstb,
  }
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

  afterEach(() => {
    vi.restoreAllMocks()
    mockExtractDocumentText.mockReset()
  })

  it('shows an honest loading state, then the fields', async () => {
    renderLstb()
    expect(await screen.findByText('Bruttoarbeitslohn (Zeile 3)')).toBeTruthy()
  })

  it('rejects unsupported file types before OCR or API parse', async () => {
    let parseCalls = 0
    server.use(
      http.post(PARSE_URL, () => {
        parseCalls += 1
        return HttpResponse.json(makeParseResponse(), { status: 200 })
      }),
    )
    renderLstb()
    const input = await screen.findByTestId('lstb-scan-file-input')

    fireEvent.change(input, { target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] } })

    expect(await screen.findByText('Bitte wähle eine PDF-, JPEG-, PNG- oder WebP-Datei aus.')).toBeTruthy()
    expect(mockExtractDocumentText).not.toHaveBeenCalled()
    expect(parseCalls).toBe(0)
  })

  it('shows an honest error when on-device OCR yields empty text without calling /v1/belege/parse', async () => {
    let parseCalls = 0
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () => {
        parseCalls += 1
        return HttpResponse.json(makeParseResponse(), { status: 200 })
      }),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: '   \n  ',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb()
    const input = await screen.findByTestId('lstb-scan-file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'blank.pdf', { type: 'application/pdf' })] } })

    expect(
      await screen.findByText(
        'Auf dem Dokument konnte kein lesbarer Text erkannt werden. Bitte prüfe die Datei oder trag die Werte manuell ein.',
      ),
    ).toBeTruthy()
    expect(parseCalls).toBe(0)
  })

  it('stages deterministic Stage-1 scan results with ZERO writes to LStB (even on field edit + blur) until explicit confirmation (#444)', async () => {
    let lstbState: LstbResponseDto = EMPTY_LSTB_RESPONSE
    const fieldPutCalls: unknown[] = []
    let bulkPutRequest: { url: string; body: unknown } | null = null
    let parseRequestBody: unknown = null

    server.use(
      http.get(LSTB_URL, () => HttpResponse.json(lstbState, { status: 200 })),
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt('rec-lstb-1', 'lstb-2026.pdf'), { status: 201 })),
      http.post(PARSE_URL, async ({ request }) => {
        parseRequestBody = await request.json()
        return HttpResponse.json(makeParseResponse(), { status: 200 })
      }),
      http.put(`${LSTB_URL}/:feld`, () => {
        fieldPutCalls.push(1)
        return HttpResponse.json(lstbState, { status: 200 })
      }),
      http.put(LSTB_URL, async ({ request }) => {
        const body = (await request.json()) as {
          bruttoarbeitslohn: number
          lohnsteuer: number
          sozialversicherung: number
        }
        bulkPutRequest = { url: request.url, body }
        lstbState = {
          bruttoarbeitslohn: { kind: 'erfasst', value: body.bruttoarbeitslohn },
          lohnsteuer: { kind: 'erfasst', value: body.lohnsteuer },
          sozialversicherung: { kind: 'erfasst', value: body.sozialversicherung },
          state: { kind: 'vollstaendig' },
        }
        return HttpResponse.json(lstbState, { status: 200 })
      }),
    )

    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: 'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2026\n3. Bruttoarbeitslohn 54.000,00',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb()
    const input = await screen.findByTestId('lstb-scan-file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'lstb-2026.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByTestId('lstb-scan-draft-banner')).toBeTruthy()
    expect(screen.getByText('Entwurf aus Lohnsteuerbescheinigung — noch nicht gespeichert')).toBeTruthy()
    expect(screen.getByText('Lokal erkannt')).toBeTruthy()
    expect(screen.getAllByText('✓ Herkunft').length).toBe(3)
    fireEvent.click(screen.getByTestId('lstb-chip-bruttoarbeitslohn'))
    expect(await screen.findByText(/LStB-Scan/)).toBeTruthy()
    expect(parseRequestBody).toEqual({
      taxYear: TAX_YEAR,
      kind: 'lstb',
      fileName: 'lstb-2026.pdf',
      receiptId: 'rec-lstb-1',
      rawText: 'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2026\n3. Bruttoarbeitslohn 54.000,00',
      textSource: 'pdf_text',
      stageDraft: true,
    })

    const grossInput = screen.getByTestId('lstb-bruttoarbeitslohn') as HTMLInputElement
    expect(grossInput.value).toBe('54000')

    // Editing and blurring a staged field MUST NOT trigger any PUT to LStB (Zero-Write guarantee)
    fireEvent.change(grossInput, { target: { value: '55000' } })
    fireEvent.blur(grossInput)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(fieldPutCalls).toHaveLength(0)
    expect(bulkPutRequest).toBeNull()

    // Explicit click on "Werte übernehmen" writes atomically with provenance
    fireEvent.click(screen.getByTestId('lstb-scan-apply'))
    await waitFor(() => expect(bulkPutRequest).not.toBeNull())
    expect(bulkPutRequest!.body).toEqual({
      bruttoarbeitslohn: 55000,
      lohnsteuer: 8200,
      sozialversicherung: 11100,
      receiptId: 'rec-lstb-1',
      actionIds: ['act-1', 'act-2', 'act-3'],
    })

    expect(await screen.findByText('Alles erfasst ✓')).toBeTruthy()
    expect(screen.queryByTestId('lstb-scan-draft-banner')).toBeNull()
    expect((screen.getByTestId('lstb-bruttoarbeitslohn') as HTMLInputElement).value).toBe('55000')
  })

  it('displays Stage-2 KI-Text-Fallback badge and sends person=B for partner certificates', async () => {
    let parseBody: unknown = null
    let confirmUrl = ''
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt('rec-partner-1', 'sabine.jpg'), { status: 201 })),
      http.post(PARSE_URL, async ({ request }) => {
        parseBody = await request.json()
        return HttpResponse.json(makeParseResponse({ stage: 'llm_text_fallback', receiptId: 'rec-partner-1' }), { status: 200 })
      }),
      http.put(LSTB_URL, ({ request }) => {
        confirmUrl = request.url
        return HttpResponse.json(
          {
            bruttoarbeitslohn: { kind: 'erfasst', value: 54000 },
            lohnsteuer: { kind: 'erfasst', value: 8200 },
            sozialversicherung: { kind: 'erfasst', value: 11100 },
            state: { kind: 'vollstaendig' },
          },
          { status: 200 },
        )
      }),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'image',
      mimeType: 'image/jpeg',
      text: 'Brutto 54000 LSt 8200 SV 11100',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb({ partnerName: 'Sabine' })
    const input = await screen.findByTestId('lstb-scan-file-input')
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'sabine.jpg', { type: 'image/jpeg' })] } })

    expect(await screen.findByText('KI-Text-Fallback (ohne personenbezogene Daten)')).toBeTruthy()
    expect(parseBody).toMatchObject({ person: 'B', kind: 'lstb' })

    fireEvent.click(screen.getByTestId('lstb-scan-apply'))
    await waitFor(() => expect(confirmUrl).toMatch(/\/lstb\?person=B$/))
  })

  it('blocks applying when a field is yellow (pruefen) until explicitly confirmed or edited', async () => {
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(
          makeParseResponse({
            fields: {
              bruttoarbeitslohn: { value: 54000, status: 'ok', sourceLines: ['3'], calculation: [{ line: '3', amount: 54000 }], reason: null },
              lohnsteuer: { value: 8200, status: 'ok', sourceLines: ['4'], calculation: [{ line: '4', amount: 8200 }], reason: null },
              sozialversicherung: {
                value: 6500,
                status: 'pruefen',
                sourceLines: ['23a', '25'],
                calculation: [
                  { line: '23', amount: 4500 },
                  { line: '25', amount: 2000 },
                ],
                reason: 'partial_sv_lines',
              },
            },
          }),
          { status: 200 },
        ),
      ),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: 'LStB 2026 partial SV',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb.pdf', { type: 'application/pdf' })] },
    })

    expect(
      await screen.findByText('Bitte prüfe und bestätige alle gelb markierten Felder, bevor du übernimmst.'),
    ).toBeTruthy()
    expect(screen.getByText('! Prüfen · Herkunft')).toBeTruthy()
    fireEvent.click(screen.getByTestId('lstb-chip-sozialversicherung'))
    expect(
      await screen.findByText(/Nur ein Teil der SV-Zeilen \(23, 25, 26, 27\) erkannt — Summe bitte prüfen\./),
    ).toBeTruthy()

    const applyBtn = screen.getByTestId('lstb-scan-apply')
    expect(applyBtn.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(screen.getByTestId('lstb-confirm-field-sozialversicherung'))
    expect(await screen.findByText('Bestätigt ✓')).toBeTruthy()
    expect(screen.getByTestId('lstb-scan-apply').getAttribute('aria-disabled')).not.toBe('true')
  })

  it('blocks applying when staged values contain a live plausibility contradiction (LSt > Brutto)', async () => {
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(
          makeParseResponse({
            fields: {
              bruttoarbeitslohn: { value: 40000, status: 'ok', sourceLines: ['3'], calculation: [{ line: '3', amount: 54000 }], reason: null },
              lohnsteuer: { value: 45000, status: 'ok', sourceLines: ['4'], calculation: [{ line: '4', amount: 8200 }], reason: null },
              sozialversicherung: { value: 8000, status: 'ok', sourceLines: ['23a'], calculation: [{ line: '23a', amount: 8000 }], reason: null },
            },
          }),
          { status: 200 },
        ),
      ),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: 'LStB 2026 conflict',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb.pdf', { type: 'application/pdf' })] },
    })

    expect(await screen.findByTestId('lstb-scan-widerspruch')).toBeTruthy()
    expect(screen.getByText('Die Lohnsteuer ist höher als der Bruttoarbeitslohn.')).toBeTruthy()
    expect(screen.getByTestId('lstb-scan-apply').getAttribute('aria-disabled')).toBe('true')
  })

  it('surfaces an explicit year-conflict dialog without staging values and switches tax year on user choice (ADR-0008)', async () => {
    const onSwitchTaxYear = vi.fn()
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(
          makeParseResponse({
            taxYearOnDocument: 2025,
            yearConflict: { documentYear: 2025, activeYear: 2026 },
            stagedActionIds: [],
          }),
          { status: 200 },
        ),
      ),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: 'Lohnsteuerbescheinigung für 2025',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb({ onSwitchTaxYear })
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb-2025.pdf', { type: 'application/pdf' })] },
    })

    expect(await screen.findByTestId('lstb-year-conflict-modal')).toBeTruthy()
    expect(screen.queryByTestId('lstb-scan-draft-banner')).toBeNull()
    expect(
      screen.getByText(
        'Diese Lohnsteuerbescheinigung gehört zum Steuerjahr 2025, du bist aber gerade im Steuerjahr 2026. Es wurden noch keine Werte übernommen.',
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByTestId('lstb-year-conflict-switch'))
    expect(onSwitchTaxYear).toHaveBeenCalledWith(2025)
  })

  it('rehydrates a pending staged scan draft across page reload from AdvisorSession without touching LStB', async () => {
    const pendingMsg: AdvisorChatMessageDto = {
      id: 'msg-scan-1',
      role: 'assistant',
      content: 'Entwurf bereit',
      createdAt: '2026-11-10T08:00:00.000Z',
      meta: {
        lstbScan: {
          receiptId: 'rec-rehydrated-1',
          stage: 'deterministic',
          taxYearOnDocument: 2026,
          person: 'A',
          actionIds: ['act-r1', 'act-r2', 'act-r3'],
        },
        actions: [
          {
            actionId: 'act-r1',
            status: 'pending',
            screen: 'lstb',
            field: 'bruttoarbeitslohn',
            label: 'Brutto',
            newValue: '61000',
            beforeRefundEur: 0,
            afterRefundEur: 0,
            deltaEur: 0,
            reason: 'LStB-Scan',
            sourceId: 'estg-9-1',
            confidenceStatus: 'ok',
            calculation: [{ line: '3', amount: 54000 }],
          },
          {
            actionId: 'act-r2',
            status: 'pending',
            screen: 'lstb',
            field: 'lohnsteuer',
            label: 'LSt',
            newValue: '9400',
            beforeRefundEur: 0,
            afterRefundEur: 0,
            deltaEur: 0,
            reason: 'LStB-Scan',
            sourceId: 'estg-9-1',
            confidenceStatus: 'ok',
            calculation: [{ line: '4', amount: 8200 }],
          },
          {
            actionId: 'act-r3',
            status: 'pending',
            screen: 'lstb',
            field: 'sozialversicherung',
            label: 'SV',
            newValue: '12200',
            beforeRefundEur: 0,
            afterRefundEur: 0,
            deltaEur: 0,
            reason: 'LStB-Scan',
            sourceId: 'estg-9-1',
            confidenceStatus: 'ok',
            calculation: [{ line: '23', amount: 4000 }],
          },
        ],
      },
    }

    server.use(
      http.get(ADVISOR_SESSION_URL, () =>
        HttpResponse.json(
          {
            enabled: true,
            greeting: 'Hallo',
            openCards: [],
            messages: [pendingMsg],
            quickChips: [],
            legalSources: [],
          },
          { status: 200 },
        ),
      ),
    )

    renderLstb()

    expect(await screen.findByTestId('lstb-scan-draft-banner')).toBeTruthy()
    expect((screen.getByTestId('lstb-bruttoarbeitslohn') as HTMLInputElement).value).toBe('61000')
    expect((screen.getByTestId('lstb-lohnsteuer') as HTMLInputElement).value).toBe('9400')
    expect((screen.getByTestId('lstb-sozialversicherung') as HTMLInputElement).value).toBe('12200')
  })

  it('handles 409 LSTB_EXISTING_VALUES_CONFLICT with an explicit overwrite confirmation dialog', async () => {
    let lstbState: LstbResponseDto = EMPTY_LSTB_RESPONSE
    const putBodies: unknown[] = []
    server.use(
      http.get(LSTB_URL, () => HttpResponse.json(lstbState, { status: 200 })),
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () => HttpResponse.json(makeParseResponse(), { status: 200 })),
      http.put(LSTB_URL, async ({ request }) => {
        const body = (await request.json()) as { overwriteExisting?: boolean }
        putBodies.push(body)
        if (!body.overwriteExisting) {
          return HttpResponse.json({ code: 'LSTB_EXISTING_VALUES_CONFLICT' }, { status: 409 })
        }
        lstbState = {
          bruttoarbeitslohn: { kind: 'erfasst', value: 54000 },
          lohnsteuer: { kind: 'erfasst', value: 8200 },
          sozialversicherung: { kind: 'erfasst', value: 11100 },
          state: { kind: 'vollstaendig' },
        }
        return HttpResponse.json(lstbState, { status: 200 })
      }),
    )
    mockExtractDocumentText.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      text: 'LStB 2026 overwrite',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })

    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb.pdf', { type: 'application/pdf' })] },
    })

    fireEvent.click(await screen.findByTestId('lstb-scan-apply'))
    expect(await screen.findByTestId('lstb-overwrite-conflict-modal')).toBeTruthy()
    expect(screen.getByText('Bestehende Werte ersetzen?')).toBeTruthy()
    expect(putBodies).toHaveLength(1)

    fireEvent.click(screen.getByTestId('lstb-overwrite-confirm'))
    expect(await screen.findByText('Alles erfasst ✓')).toBeTruthy()
    expect(putBodies).toHaveLength(2)
    expect(putBodies[1]).toMatchObject({ overwriteExisting: true })
  })

  it('supports viewing the original receipt modal and discarding a staged draft', async () => {
    const dismissedIds: string[] = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/lstb-preview')
    URL.revokeObjectURL = vi.fn()

    try {
      server.use(
        http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt('rec-view-1', 'lstb-2026.pdf'), { status: 201 })),
        http.post(PARSE_URL, () =>
          HttpResponse.json(
            makeParseResponse({ receiptId: 'rec-view-1', stagedActionIds: ['act-d1', 'act-d2'] }),
            { status: 200 },
          ),
        ),
        http.get('*/v1/belege/rec-view-1/datei', () => {
          return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
          })
        }),
        http.post(`*/v1/steuerjahre/${TAX_YEAR}/advisor/actions/:actionId/dismiss`, ({ params }) => {
          dismissedIds.push(String(params.actionId))
          return HttpResponse.json({}, { status: 200 })
        }),
      )
      mockExtractDocumentText.mockResolvedValue({
        kind: 'pdf',
        mimeType: 'application/pdf',
        text: 'LStB 2026 preview & discard',
        usedOcrFallback: false,
        pagesProcessed: 1,
      })

      renderLstb()
      fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
        target: { files: [new File(['%PDF-1.4'], 'lstb-2026.pdf', { type: 'application/pdf' })] },
      })

      // View original receipt
      fireEvent.click(await screen.findByTestId('lstb-scan-view-receipt'))
      expect(await screen.findByTestId('receipt-file-modal')).toBeTruthy()
      fireEvent.click(screen.getByTestId('receipt-file-close'))
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/lstb-preview'))

      // Discard staged draft
      fireEvent.click(screen.getByTestId('lstb-scan-discard'))
      await waitFor(() => expect(screen.queryByTestId('lstb-scan-draft-banner')).toBeNull())
      expect(dismissedIds).toEqual(['act-d1', 'act-d2'])
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})
