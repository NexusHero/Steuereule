// LStB-Masken-Screen (REQ-016) — renders the three fields from GET, sends whole-euro values via
// PUT, and shows a named widerspruch (ADR-008), never a silent fix. Honest loading/error states.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { LstbScreen } from './LstbScreen'
import { EMPTY_LSTB_RESPONSE, server } from '../../../test/test-msw-server'
import { pendingLstbScanAction } from '../../../test/test-lstb-fixtures'
import type {
  AdvisorChatMessageDto,
  LstbExtractedFieldDto,
  LstbResponseDto,
  ParseReceiptResponseDto,
  ReceiptResponseDto,
} from '@steuereule/api-client'
import { confirmAction } from '../../../test/test-confirm'
import { renderWithQuery } from '../../../test/test-render'

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
  opts: string | { readonly partnerName?: string; readonly onSwitchTaxYear?: (year: number) => void; readonly onDone?: () => void; readonly lng?: 'de' | 'en' } = {},
) {
  const resolved = typeof opts === 'string' ? { partnerName: opts } : opts
  return renderWithQuery(
    <LstbScreen
      taxYear={TAX_YEAR}
      onDone={resolved.onDone ?? (() => {})}
      {...(resolved.partnerName ? { partnerName: resolved.partnerName } : {})}
      {...(resolved.onSwitchTaxYear ? { onSwitchTaxYear: resolved.onSwitchTaxYear } : {})}
    />,
    { language: resolved.lng ?? 'de' },
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
    holders: [],
    holderTaxYear: null,
    processing: { state: 'neu', reason: null, pending: 0, applied: 0, dismissed: 0, draftsTaxYear: null, open: true },
    filledFields: [],
    duplicateOf: null,
    mimeType: 'application/pdf',
    byteLength: 512,
    assignment: { kind: 'ungebunden' },
  }
}

const missingLine: LstbExtractedFieldDto = { value: null, status: 'pruefen', sourceLines: [], calculation: [], reason: 'missing' }
const NO_LINES: NonNullable<ParseReceiptResponseDto['lstb']>['lines'] = {
  solidaritaetszuschlag: missingLine,
  kirchensteuer: missingLine,
  kirchensteuerEhegatte: missingLine,
  rvArbeitgeber: missingLine,
  rvArbeitnehmer: missingLine,
  zuschuesseKvPv: missingLine,
  zuschussPv: missingLine,
  kvArbeitnehmer: missingLine,
  pvArbeitnehmer: missingLine,
  avArbeitnehmer: missingLine,
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
    lines: NO_LINES,
    employer: { value: null, status: 'pruefen', reason: 'missing' },
    stagedActionIds: ['act-1', 'act-2', 'act-3'],
    securityBlocked: false,
    person: 'A',
    personUnclear: false,
    personNotRecordable: false,
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

  it('does not put the word „unlesbar“ under a field that is fine: the way out reads as the action it is (Echtdatenlauf 4)', async () => {
    renderLstb()
    await screen.findByText('Bruttoarbeitslohn (Zeile 3)')
    // The bare word read like a verdict on every field; it is an offer to the user who cannot read the paper.
    expect(screen.queryByText('unlesbar')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Kann ich nicht lesen' }).length).toBeGreaterThan(0)
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

    const unclearButtons = screen.getAllByText('Kann ich nicht lesen')
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

  it('saves the church tax of Zeile 6 on blur, without touching the three required fields (#450 6F)', async () => {
    const puts: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/:jahr/lstb-kirchensteuer', async ({ request }) => {
        const body = await request.json()
        puts.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const line6 = await screen.findByLabelText('Kirchensteuer des Arbeitnehmers (Zeile 6) (Ganzzahlige Euro)')

    fireEvent.change(line6, { target: { value: '540' } })
    fireEvent.blur(line6)

    await waitFor(() => expect(puts).toEqual([{ kirchensteuer: 540, kirchensteuerEhegatte: null }]))
  })

  it('saves the employer subsidies of Zeile 24 on blur (real case 2024, ADR-0090)', async () => {
    const puts: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/:jahr/lstb-zuschuesse', async ({ request }) => {
        const body = await request.json()
        puts.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const line24 = await screen.findByLabelText('Steuerfreie Zuschüsse zur Kranken- und Pflegeversicherung (Zeile 24 a–c, zusammen) (Ganzzahlige Euro)')
    fireEvent.change(line24, { target: { value: '5072' } })
    fireEvent.blur(line24)
    await waitFor(() => expect(puts).toEqual([{ zuschuesseKvPv: 5072 }]))
  })

  it('saves the employer’s name for the Verlauf’s „neuer Arbeitgeber“, per person, and clears it when emptied (ADR-0099 §8)', async () => {
    const puts: { body: unknown; person: string | null }[] = []
    server.use(
      http.get('*/v1/steuerjahre/:jahr/lstb-arbeitgeber', () => HttpResponse.json({ arbeitgeber: 'Muster GmbH' }, { status: 200 })),
      http.put('*/v1/steuerjahre/:jahr/lstb-arbeitgeber', async ({ request }) => {
        const body = await request.json()
        puts.push({ body, person: new URL(request.url).searchParams.get('person') })
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const employer = (await screen.findByTestId('lstb-arbeitgeber')) as HTMLInputElement
    await waitFor(() => expect(employer.value).toBe('Muster GmbH'))
    fireEvent.change(employer, { target: { value: 'Roche AG' } })
    fireEvent.blur(employer)
    await waitFor(() => expect(puts).toEqual([{ body: { arbeitgeber: 'Roche AG' }, person: null }]))
  })

  it('shows the Zeile 24 hint while the server reports the subsidy open, and hides it after Zeile 24 is saved', async () => {
    let open = true
    const lines = () => ({
      rvArbeitnehmer: null, rvArbeitgeber: null, kvArbeitnehmer: 3000, pvArbeitnehmer: null, avArbeitnehmer: null,
      zuschussPv: null, solidaritaetszuschlag: null, zuschuesseKvPv: open ? null : 0, sozialversicherung: null, subsidyOpen: open,
    })
    server.use(
      http.get('*/v1/steuerjahre/:jahr/lstb-zeilen', () => HttpResponse.json(lines())),
      http.put('*/v1/steuerjahre/:jahr/lstb-zuschuesse', async ({ request }) => {
        open = false
        return HttpResponse.json(await request.json(), { status: 200 })
      }),
    )
    renderLstb()
    expect(await screen.findByText(/Zeile 25 oder 26 ist ausgefüllt: Bitte Zeile 24 eintragen \(auch 0\)/)).toBeTruthy()
    const line24 = await screen.findByLabelText('Steuerfreie Zuschüsse zur Kranken- und Pflegeversicherung (Zeile 24 a–c, zusammen) (Ganzzahlige Euro)')
    fireEvent.change(line24, { target: { value: '0' } })
    fireEvent.blur(line24)
    await waitFor(() => expect(screen.queryByText(/Bitte Zeile 24 eintragen/)).toBeNull())
  })

  it('keeps the cents a user types from the paper as whole euros (real case 2024: 7.021,48 and 5.071,60 were lost)', async () => {
    const lines: unknown[] = []
    const subsidies: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/:jahr/lstb-zeilen', async ({ request }) => {
        const body = await request.json()
        lines.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
      http.put('*/v1/steuerjahre/:jahr/lstb-zuschuesse', async ({ request }) => {
        const body = await request.json()
        subsidies.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const rv = await screen.findByLabelText('Arbeitnehmeranteil Rentenversicherung (Zeile 23) (Ganzzahlige Euro)')
    fireEvent.change(rv, { target: { value: '7021,48' } })
    fireEvent.blur(rv)
    const line24 = await screen.findByLabelText('Steuerfreie Zuschüsse zur Kranken- und Pflegeversicherung (Zeile 24 a–c, zusammen) (Ganzzahlige Euro)')
    fireEvent.change(line24, { target: { value: '5071,60' } })
    fireEvent.blur(line24)
    await waitFor(() => expect(lines).toEqual([{ rvArbeitnehmer: 7021 }]))
    await waitFor(() => expect(subsidies).toEqual([{ zuschuesseKvPv: 5072 }]))
  })

  it('saves a social-security line partially and a Soli with a decimal comma', async () => {
    const puts: unknown[] = []
    server.use(
      http.put('*/v1/steuerjahre/:jahr/lstb-zeilen', async ({ request }) => {
        const body = await request.json()
        puts.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const rv = await screen.findByLabelText('Arbeitnehmeranteil Rentenversicherung (Zeile 23) (Ganzzahlige Euro)')
    fireEvent.change(rv, { target: { value: '4200' } })
    fireEvent.blur(rv)
    const soli = await screen.findByLabelText('Einbehaltener Solidaritätszuschlag (Zeile 5, in Euro mit Cent)')
    fireEvent.change(soli, { target: { value: '12,50' } })
    fireEvent.blur(soli)
    await waitFor(() => expect(puts).toEqual([{ rvArbeitnehmer: 4200 }, { solidaritaetszuschlag: 12.5 }]))
  })

  it('an emptied church tax line is stored as not entered, never as 0 €', async () => {
    const puts: unknown[] = []
    server.use(
      http.get('*/v1/steuerjahre/:jahr/lstb-kirchensteuer', () => HttpResponse.json({ kirchensteuer: 540, kirchensteuerEhegatte: null })),
      http.put('*/v1/steuerjahre/:jahr/lstb-kirchensteuer', async ({ request }) => {
        const body = await request.json()
        puts.push(body)
        return HttpResponse.json(body, { status: 200 })
      }),
    )
    renderLstb()
    const line6 = await screen.findByDisplayValue('540')

    fireEvent.change(line6, { target: { value: '' } })
    fireEvent.blur(line6)

    await waitFor(() => expect(puts).toEqual([{ kirchensteuer: null, kirchensteuerEhegatte: null }]))
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

  it('shows an honest error when on-device OCR yields empty text and only records that on the stored Beleg (ADR-0097)', async () => {
    const parseBodies: unknown[] = []
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, async ({ request }) => {
        parseBodies.push(await request.json())
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
    // No text is sent: the server only hears that the device found none, so the Beleg says „kein Text“.
    await waitFor(() => expect(parseBodies).toEqual([{ taxYear: TAX_YEAR, fileName: 'blank.pdf', receiptId: 'rec-lstb-1', deviceReadFailure: 'empty_text' }]))
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
      // The mask is the entry context (ADR-0097 §4) and the upload area (ADR-0092).
      mask: 'lstb',
      area: 'A',
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

  it('asks whose the certificate is when its name contradicts B’s mask, and reads it for the chosen person (ADR-0092)', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt('rec-x', 'elias.pdf'), { status: 201 })),
      http.post(PARSE_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        if (body.holder === undefined) {
          return HttpResponse.json({
            mode: 'deterministic_fallback',
            securityBlocked: false,
            parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: 'Für wen?', taxYear: null },
            stagedAction: null,
            assistantMessage: null,
            assignment: {
              holder: null,
              alsoFor: [],
              question: { reason: 'contradiction', options: [{ holder: 'A', name: 'Elias' }, { holder: 'B', name: 'Sabine' }], preselected: 'A', printedName: 'Elias Muster', area: { holder: 'B', name: 'Sabine' }, offerCreate: [] },
            },
          } satisfies ParseReceiptResponseDto)
        }
        return HttpResponse.json({ ...makeParseResponse({ person: 'A' }), assignment: { holder: { holder: 'A', name: 'Elias' }, question: null, alsoFor: [] } })
      }),
    )
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnsteuerbescheinigung\nElias Muster', usedOcrFallback: false, pagesProcessed: 1 })
    renderLstb({ partnerName: 'Sabine' })
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), { target: { files: [new File(['%PDF'], 'elias.pdf', { type: 'application/pdf' })] } })
    expect((await screen.findByTestId('beleg-zuordnung-frage')).textContent).toBe('Der Beleg lautet auf Elias Muster, du bist bei Sabine – für wen?')
    expect(bodies[0]).toMatchObject({ area: 'B' })
    fireEvent.click(screen.getByTestId('beleg-zuordnung-fuer-A'))
    expect((await screen.findByTestId('lstb-scan-anderswo')).textContent).toContain('Elias')
    expect(bodies[1]).toMatchObject({ holder: 'A', receiptId: 'rec-x' })
    expect(bodies[1]!.area).toBeUndefined()
  })

  it('displays Stage-2 KI-Text-Fallback badge and sends person=B for partner certificates', async () => {
    let parseBody: unknown = null
    let confirmUrl = ''
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt('rec-partner-1', 'sabine.jpg'), { status: 201 })),
      http.post(PARSE_URL, async ({ request }) => {
        parseBody = await request.json()
        return HttpResponse.json(makeParseResponse({ stage: 'llm_text_fallback', receiptId: 'rec-partner-1', person: 'B' }), { status: 200 })
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
    // Uploaded in B's mask: B's area (ADR-0092).
    expect(parseBody).toMatchObject({ area: 'B', kind: 'lstb' })

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

  it('files a certificate of another year there and offers the switch instead of blocking (ADR-0097 §5)', async () => {
    const onSwitchTaxYear = vi.fn()
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(
          {
            ...makeParseResponse({
              taxYearOnDocument: 2025,
              yearConflict: { documentYear: 2025, activeYear: 2026 },
            }),
            draftsTaxYear: 2025,
            filedInTaxYear: 2025,
          },
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
    // Its drafts wait in 2025: this mask of 2026 shows no draft it could not take over.
    expect(screen.queryByTestId('lstb-scan-draft-banner')).toBeNull()
    expect(screen.getByText('Liegt im Steuerjahr 2025')).toBeTruthy()
    expect(
      screen.getByText('Diese Lohnsteuerbescheinigung gehört zum Steuerjahr 2025. Ihre Werte warten dort auf dich, nicht in 2026. Es wurde noch nichts übernommen.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByTestId('lstb-year-conflict-switch'))
    expect(onSwitchTaxYear).toHaveBeenCalledWith(2025)
  })

  it('says when a certificate of another year was read before and staged nothing there', async () => {
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(makeParseResponse({ taxYearOnDocument: 2025, yearConflict: { documentYear: 2025, activeYear: 2026 }, stagedActionIds: [] }), { status: 200 }),
      ),
    )
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnsteuerbescheinigung für 2025', usedOcrFallback: false, pagesProcessed: 1 })

    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb-2025.pdf', { type: 'application/pdf' })] },
    })

    expect(await screen.findByText('Diese Lohnsteuerbescheinigung gehört zum Steuerjahr 2025, du bist gerade in 2026. Wechsle dorthin und lies sie dort noch einmal.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('lstb-year-conflict-cancel'))
    expect(screen.queryByTestId('lstb-year-conflict-modal')).toBeNull()
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
          pendingLstbScanAction({ actionId: 'act-r1', field: 'bruttoarbeitslohn', label: 'Brutto', newValue: '61000', calculation: [{ line: '3', amount: 54000 }] }),
          pendingLstbScanAction({ actionId: 'act-r2', field: 'lohnsteuer', label: 'LSt', newValue: '9400', calculation: [{ line: '4', amount: 8200 }] }),
          pendingLstbScanAction({ actionId: 'act-r3', field: 'sozialversicherung', label: 'SV', newValue: '12200', calculation: [{ line: '23', amount: 4000 }] }),
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

  /** Mocks a scan whose confirmation is refused with 409 until the PUT says how to treat the existing values. */
  function mockScanIntoExistingValuesConflict() {
    let lstbState: LstbResponseDto = EMPTY_LSTB_RESPONSE
    const putBodies: unknown[] = []
    server.use(
      http.get(LSTB_URL, () => HttpResponse.json(lstbState, { status: 200 })),
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () => HttpResponse.json(makeParseResponse(), { status: 200 })),
      http.put(LSTB_URL, async ({ request }) => {
        const body = (await request.json()) as { overwriteExisting?: boolean; addToExisting?: boolean }
        putBodies.push(body)
        if (!body.overwriteExisting && !body.addToExisting) {
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
    return putBodies
  }

  async function scanAndApplyDraft() {
    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), {
      target: { files: [new File(['%PDF-1.4'], 'lstb.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(await screen.findByTestId('lstb-scan-apply'))
  }

  it('handles 409 LSTB_EXISTING_VALUES_CONFLICT with an explicit overwrite confirmation dialog', async () => {
    const putBodies = mockScanIntoExistingValuesConflict()

    await scanAndApplyDraft()
    expect(await screen.findByTestId('lstb-overwrite-conflict-modal')).toBeTruthy()
    expect(screen.getByText('Bestehende Werte ersetzen?')).toBeTruthy()
    expect(putBodies).toHaveLength(1)

    fireEvent.click(screen.getByTestId('lstb-overwrite-confirm'))
    expect(await screen.findByText('Alles erfasst ✓')).toBeTruthy()
    expect(putBodies).toHaveLength(2)
    expect(putBodies[1]).toMatchObject({ overwriteExisting: true })
  })

  it('adds a further certificate of the year instead of replacing — handles 409 LSTB_EXISTING_VALUES_CONFLICT with an explicit overwrite confirmation dialog', async () => {
    const putBodies = mockScanIntoExistingValuesConflict()

    await scanAndApplyDraft()
    expect(await screen.findByTestId('lstb-overwrite-conflict-modal')).toBeTruthy()
    expect(screen.getByText('Bestehende Werte ersetzen?')).toBeTruthy()
    expect(putBodies).toHaveLength(1)

    fireEvent.click(screen.getByTestId('lstb-overwrite-add'))
    expect(await screen.findByText('Alles erfasst ✓')).toBeTruthy()
    expect(putBodies).toHaveLength(2)
    expect(putBodies[1]).toMatchObject({ addToExisting: true })
    expect(putBodies[1]).not.toHaveProperty('overwriteExisting')
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
      confirmAction('lstbDiscardDraft')
      await waitFor(() => expect(screen.queryByTestId('lstb-scan-draft-banner')).toBeNull())
      expect(dismissedIds).toEqual(['act-d1', 'act-d2'])
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })

  it('waits for an in-flight blur PUT before invoking onDone', async () => {
    let releasePut: () => void = () => {}
    const putPending = new Promise<void>((resolve) => {
      releasePut = resolve
    })
    server.use(
      http.put('*/v1/steuerjahre/:jahr/lstb/:feld', async () => {
        await putPending
        return HttpResponse.json(EMPTY_LSTB_RESPONSE, { status: 200 })
      }),
    )
    const onDone = vi.fn()
    renderLstb({ onDone })

    const input = await screen.findByTestId('lstb-bruttoarbeitslohn')
    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByTestId('lstb-weiter'))

    await new Promise((r) => setTimeout(r, 20))
    expect(onDone).not.toHaveBeenCalled()

    releasePut()
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})

// Real-data run 4: the scan filled only the three values; the user typed Soli, church tax, the lines and the
// employer. Every line read is now shown in the draft and taken over with the three in one step.
describe('LstbScreen — the further lines of a scanned certificate', () => {
  it('shows each line read, blocks until a yellow one is confirmed, and takes them over with the three values', async () => {
    let bulkPutBody: Record<string, unknown> | null = null
    const ok = (value: number, line: string): LstbExtractedFieldDto => ({ value, status: 'ok', sourceLines: [line], calculation: [{ line, amount: value }], reason: null })
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json(makeUploadedReceipt(), { status: 201 })),
      http.post(PARSE_URL, () =>
        HttpResponse.json(
          makeParseResponse({
            lines: {
              ...NO_LINES,
              solidaritaetszuschlag: ok(12.34, '5'),
              kirchensteuer: ok(576, '6'),
              kvArbeitnehmer: { value: 3651, status: 'pruefen', sourceLines: ['25'], calculation: [{ line: '25', amount: 3650.5 }], reason: 'unreadable' },
            },
            employer: { value: 'Beispielwerke GmbH', status: 'ok', reason: null },
            stagedActionIds: ['act-1', 'act-2', 'act-3', 'act-4', 'act-5', 'act-6'],
          }),
          { status: 200 },
        ),
      ),
      http.put(LSTB_URL, async ({ request }) => {
        bulkPutBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(EMPTY_LSTB_RESPONSE, { status: 200 })
      }),
    )
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Lohnsteuerbescheinigung 2026', usedOcrFallback: false, pagesProcessed: 1 })

    renderLstb()
    fireEvent.change(await screen.findByTestId('lstb-scan-file-input'), { target: { files: [new File(['%PDF-1.4'], 'lstb-2026.pdf', { type: 'application/pdf' })] } })

    const lines = await screen.findByTestId('lstb-scan-lines')
    expect(lines.textContent).toContain('Einbehaltener Solidaritätszuschlag (Zeile 5, in Euro mit Cent)')
    expect((screen.getByTestId('lstb-scan-line-solidaritaetszuschlag') as HTMLInputElement).value).toBe('12,34')
    expect((screen.getByTestId('lstb-scan-line-kirchensteuer') as HTMLInputElement).value).toBe('576')
    expect((screen.getByTestId('lstb-scan-line-arbeitgeber') as HTMLInputElement).value).toBe('Beispielwerke GmbH')
    // A line the certificate does not print is not offered.
    expect(screen.queryByTestId('lstb-scan-line-kirchensteuerEhegatte')).toBeNull()

    // Line 25 is yellow: „Werte übernehmen“ waits for its confirmation, like the three values.
    expect(screen.getByTestId('lstb-scan-apply').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByTestId('lstb-confirm-line-kvArbeitnehmer'))
    await waitFor(() => expect(screen.getByTestId('lstb-scan-apply').getAttribute('aria-disabled')).not.toBe('true'))

    fireEvent.change(screen.getByTestId('lstb-scan-line-kirchensteuer'), { target: { value: '580,40' } })
    fireEvent.click(screen.getByTestId('lstb-scan-apply'))
    await waitFor(() => expect(bulkPutBody).not.toBeNull())
    expect(bulkPutBody).toEqual({
      bruttoarbeitslohn: 54000,
      lohnsteuer: 8200,
      sozialversicherung: 11100,
      receiptId: 'rec-lstb-1',
      actionIds: ['act-1', 'act-2', 'act-3', 'act-4', 'act-5', 'act-6'],
      lines: { solidaritaetszuschlag: 12.34, kirchensteuer: 580, kvArbeitnehmer: 3651 },
      arbeitgeber: 'Beispielwerke GmbH',
    })
  })
})

